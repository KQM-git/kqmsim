import { compileQuery, QueryError } from "./query.mjs";
import { ID_PATTERN, loadResult, syncPublicDatabase } from "./storage.mjs";

const json = (value, status = 200) =>
	Response.json(value, {
		status,
		headers: {
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
		},
	});

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		try {
			if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
			if (url.pathname.startsWith("/api/admin/")) {
				if (
					!env.SYNC_TOKEN ||
					request.headers.get("Authorization") !== `Bearer ${env.SYNC_TOKEN}`
				)
					return json({ error: "Unauthorized" }, 401);
				if (request.method !== "POST")
					return json({ error: "Method not allowed" }, 405);
				if (url.pathname === "/api/admin/sync")
					return json(await syncPublicDatabase(env, { force: true }));
				// Copy result files in small, resumable batches. No client-supplied URLs.
				if (url.pathname === "/api/admin/warm") {
					const after = url.searchParams.get("after") ?? "";
					if (after && !ID_PATTERN.test(after))
						return json({ error: "Invalid cursor" }, 400);
					const { results } = await env.DB.prepare(
						"SELECT id,document FROM simulations WHERE visible=1 AND id > ? ORDER BY id LIMIT 10",
					)
						.bind(after)
						.all();
					for (let start = 0; start < results.length; start += 5) {
						await Promise.all(
							results.slice(start, start + 5).map(async (row) => {
								const body = await loadResult(JSON.parse(row.document), env);
								if (body instanceof ReadableStream) await body.cancel();
							}),
						);
					}
					return json({
						count: results.length,
						cursor: results.at(-1)?.id ?? null,
					});
				}
				return json({ error: "Not found" }, 404);
			}
			if (request.method !== "GET" && request.method !== "HEAD")
				return json({ error: "Method not allowed" }, 405);
			if (url.pathname === "/api/db" || url.pathname === "/api/db/") {
				const raw = url.searchParams.get("q") ?? "{}";
				if (raw.length > 8000) throw new QueryError("The search is too large.");
				let input;
				try {
					input = JSON.parse(raw);
				} catch {
					throw new QueryError("Invalid search JSON.");
				}
				const { sql, params } = compileQuery(input);
				const { results } = await env.DB.prepare(sql)
					.bind(...params)
					.all();
				return json({ data: results.map((row) => JSON.parse(row.document)) });
			}
			if (url.pathname === "/api/status") {
				const total = await env.DB.prepare(
					"SELECT COUNT(*) AS count FROM simulations WHERE visible=1",
				).first();
				const state = await env.DB.prepare(
					"SELECT value FROM sync_state WHERE key='progress'",
				).first();
				return json({
					simulations: total.count,
					lastSync: state
						? (JSON.parse(state.value).completedAt ?? null)
						: null,
				});
			}
			const match = url.pathname.match(
				/^\/api\/(db\/id|share\/db)\/([a-zA-Z0-9_-]{1,128})$/,
			);
			if (match) {
				const row = await env.DB.prepare(
					"SELECT document FROM simulations WHERE id=? AND visible=1",
				)
					.bind(match[2])
					.first();
				if (!row) return json({ error: "Simulation not found" }, 404);
				const entry = JSON.parse(row.document);
				if (match[1] === "db/id") return json(entry);
				return new Response(await loadResult(entry, env), {
					headers: {
						"Content-Type": "application/json",
						"Cache-Control": "public, max-age=300",
						"X-Content-Type-Options": "nosniff",
					},
				});
			}
			if (
				/^\/api\/assets\/(avatar|weapons|artifacts|misc)\/[a-zA-Z0-9_.-]+\.(png|jpg)$/.test(
					url.pathname,
				)
			) {
				const key = url.pathname.slice(5);
				const contentType = key.endsWith(".jpg") ? "image/jpeg" : "image/png";
				const saved = await env.FILES.get(key);
				if (saved)
					return new Response(saved.body, {
						headers: {
							"Content-Type": contentType,
							"Cache-Control": "public, max-age=604800",
						},
					});
				const source = await fetch(`https://simpact.app${url.pathname}`, {
					signal: AbortSignal.timeout(15000),
				});
				if (
					!source.ok ||
					!source.headers.get("Content-Type")?.startsWith("image/")
				)
					return new Response("Image not found", { status: 404 });
				const bytes = await source.arrayBuffer();
				ctx.waitUntil(
					env.FILES.put(key, bytes, {
						httpMetadata: { contentType },
					}),
				);
				return new Response(bytes, {
					headers: {
						"Content-Type": contentType,
						"Cache-Control": "public, max-age=604800",
					},
				});
			}
			return json({ error: "Not found" }, 404);
		} catch (error) {
			if (error instanceof QueryError)
				return json({ error: error.message }, 400);
			console.error("Database request failed", error.message);
			return json({ error: "The database is temporarily unavailable." }, 503);
		}
	},
	async scheduled(_event, env) {
		await syncPublicDatabase(env);
	},
};
