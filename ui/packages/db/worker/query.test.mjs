import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import worker from "./index.mjs";
import { compileQuery, QueryError } from "./query.mjs";
import {
	loadResult,
	syncPublicDatabase,
	UPSERT,
	validateEntries,
} from "./storage.mjs";

const db = new DatabaseSync(":memory:");
db.exec(
	readFileSync(
		new URL("../migrations/0001_database.sql", import.meta.url),
		"utf8",
	),
);
const entry = (id, names, tags, dps, description = "Team") => ({
	_id: id,
	share_key: `share${id}`,
	create_date: "1700000000",
	is_db_valid: true,
	config: "options iteration=1;",
	description,
	submitter: "Tester",
	accepted_tags: tags,
	summary: {
		char_names: names,
		team: names.map((name) => ({ name })),
		mean_dps_per_target: dps,
		sim_duration: { mean: 90 },
	},
});
const rows = [
	entry("a", ["nahida", "furina"], [1], 90000, "Nahida's team [test]"),
	entry("b", ["hutao", "furina"], [1, 9], 100000),
	entry("c", ["aetheranemo"], [8], 50000),
];
validateEntries(rows);
db.prepare(UPSERT).run({ 1: JSON.stringify(rows), 2: Date.now(), 3: "run" });
function ids(query, extra = {}) {
	const { sql, params } = compileQuery({ query, ...extra });
	return db
		.prepare(sql)
		.all(...params)
		.map((r) => JSON.parse(r.document)._id);
}
test("character, tag, traveller, and exclusion filters select the right records", () => {
	assert.deepEqual(ids({ "summary.char_names": "nahida" }), ["a"]);
	assert.deepEqual(
		ids({
			$and: [
				{ "summary.char_names": "furina" },
				{ accepted_tags: { $nin: [9] } },
			],
		}),
		["a"],
	);
	assert.deepEqual(ids({ "summary.char_names": { $ne: "furina" } }), ["c"]);
	assert.deepEqual(
		ids({
			$or: [
				{ "summary.char_names": "aetheranemo" },
				{ "summary.char_names": "lumineanemo" },
			],
		}),
		["c"],
	);
});
test("text search preserves punctuation, matches case-insensitively, and cannot inject SQL", () => {
	assert.deepEqual(
		ids({ description: { $regex: "NAHIDA's team \\[test\\]", $options: "i" } }),
		["a"],
	);
	assert.deepEqual(ids({ description: "' OR 1=1 --" }), []);
	assert.throws(() => ids({ "description') OR 1=1 --": "x" }), QueryError);
	assert.throws(() => ids({ description: { $regex: ".*" } }), QueryError);
});
test("DPS sorting and page offsets are stable", () => {
	assert.deepEqual(
		ids({}, { sort: { "summary.mean_dps_per_target": -1 }, limit: 1, skip: 1 }),
		["a"],
	);
	assert.throws(() => ids({}, { limit: 1000 }), QueryError);
});
test("upserts replace a simulation without duplicates, and hidden entries are not public", () => {
	db.prepare(UPSERT).run({
		1: JSON.stringify([entry("a", ["nahida"], [1], 120000)]),
		2: Date.now(),
		3: "next",
	});
	assert.equal(db.prepare("SELECT count(*) AS n FROM simulations").get().n, 3);
	assert.deepEqual(ids({}, { sort: { "summary.mean_dps_per_target": -1 } }), [
		"a",
		"b",
		"c",
	]);
	db.prepare("UPDATE simulations SET visible=0 WHERE id='c'").run();
	assert.deepEqual(ids({ "summary.char_names": "aetheranemo" }), []);
	assert.equal(
		db.prepare("SELECT count(*) AS n FROM simulations WHERE id='c'").get().n,
		1,
	);
});
test("an invalid import is rejected and public clients cannot start an import", async () => {
	assert.throws(() => validateEntries([{ _id: "../other" }]));
	const response = await worker.fetch(
		new Request("https://db.kqm.gg/api/admin/sync", { method: "POST" }),
		{},
		{},
	);
	assert.equal(response.status, 401);
});

test("failed imports preserve records and their cursor, release the lease, and resume", async (t) => {
	const storage = new DatabaseSync(":memory:");
	storage.exec(
		readFileSync(
			new URL("../migrations/0001_database.sql", import.meta.url),
			"utf8",
		),
	);
	const prepare = (sql) => {
		let params = [];
		return {
			bind(...values) {
				params = values;
				return this;
			},
			first() {
				return storage.prepare(sql).get(...params) ?? null;
			},
			run() {
				const stmt = storage.prepare(sql);
				const values = sql.includes("?1")
					? [Object.fromEntries(params.map((value, i) => [i + 1, value]))]
					: params;
				return { meta: stmt.run(...values) };
			},
		};
	};
	const env = {
		DB: {
			prepare,
			batch: async (statements) => statements.map((s) => s.run()),
		},
	};
	const page = Array.from({ length: 100 }, (_, i) =>
		entry(`sim${i}`, ["nahida"], [1], 50000),
	);
	const source = t.mock.method(globalThis, "fetch", async () =>
		Response.json({ data: page }),
	);
	const progress = await syncPublicDatabase(env, { pages: 1 });
	assert.equal(progress.offset, 100);
	source.mock.mockImplementation(async () =>
		Response.json({ error: "Temporarily unavailable" }),
	);
	await assert.rejects(syncPublicDatabase(env), /no simulation data/);
	assert.equal(
		storage
			.prepare("SELECT COUNT(*) AS n FROM simulations WHERE visible=1")
			.get().n,
		100,
	);
	assert.equal(
		JSON.parse(
			storage.prepare("SELECT value FROM sync_state WHERE key='progress'").get()
				.value,
		).offset,
		100,
	);
	assert.equal(
		storage.prepare("SELECT value FROM sync_state WHERE key='lock'").get(),
		undefined,
	);
	source.mock.mockImplementation(async () => Response.json({}));
	const completed = await syncPublicDatabase(env);
	assert.equal(completed.count, 100);
	assert.equal(completed.run, undefined);
	source.mock.mockImplementation(async () => {
		throw new Error("Should not fetch again today");
	});
	assert.equal(
		(await syncPublicDatabase(env)).completedAt,
		completed.completedAt,
	);
	storage.close();
});

test("result files use the exact share key and remain available from R2 without the source", async (t) => {
	const saved = new Map();
	const env = {
		FILES: {
			get: async (key) => (saved.has(key) ? { body: saved.get(key) } : null),
			put: async (key, body) => saved.set(key, body),
		},
	};
	const result = {
		character_details: [],
		statistics: {},
		config_file: "options iteration=1;",
	};
	const source = t.mock.method(globalThis, "fetch", async (url) => {
		assert.equal(url, "https://gcsim.app/api/share/sharea");
		return Response.json(result);
	});
	assert.deepEqual(JSON.parse(await loadResult(rows[0], env)), result);
	source.mock.mockImplementation(async () => {
		throw new Error("Source unavailable");
	});
	assert.deepEqual(JSON.parse(await loadResult(rows[0], env)), result);
	assert.equal(source.mock.callCount(), 1);
});
