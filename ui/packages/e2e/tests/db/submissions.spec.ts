import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "../../src";

const result = JSON.parse(
	readFileSync(
		new URL("./fixtures/razor-result.json", import.meta.url),
		"utf8",
	),
);
const id = "kqm-11111111-1111-4111-8111-111111111111";
const entry = {
	_id: id,
	create_date: 1_790_000_000,
	description:
		"Razor, Nahida, Fischl, and Chevreuse. A complete rotation with clear energy assumptions.",
	submitter: "KQM tester",
	config: result.config_file,
	share_key: "saved-result",
	accepted_tags: [],
	summary: {
		char_names: result.character_details.map((c: { name: string }) => c.name),
		team: result.character_details,
		mean_dps_per_target: 66610,
		sim_duration: result.statistics.duration,
		target_count: 1,
		mode: 2,
	},
};
const initial = () => ({
	id,
	status: "pending",
	submittedAt: 1_790_000_000_000,
	reviewedAt: null as number | null,
	sourceUrl: "https://gcsim.app/sh/example",
	reason: "",
	publishedId: null as string | null,
	entry,
});
const authorization = `Basic ${Buffer.from("reviewer:test-password-only").toString("base64")}`;

async function reviewRoutes(
	page: Page,
	options: { empty?: boolean; fail?: boolean } = {},
) {
	let record = initial();
	const decisions: Record<string, string>[] = [];
	await page.route("**/api/review/**", async (route) => {
		const request = route.request();
		if (request.headers().authorization !== authorization)
			return route.fulfill({
				status: 401,
				json: {
					error: "Enter the reviewer username and password, then try again.",
				},
			});
		const url = new URL(request.url());
		if (url.pathname.endsWith("/session"))
			return route.fulfill({ json: { reviewer: "reviewer" } });
		if (url.pathname.endsWith("/decision")) {
			const body = request.postDataJSON();
			decisions.push(body);
			record = {
				...record,
				status: body.action === "reject" ? "rejected" : "approved",
				reason: body.reason,
				reviewedAt: Date.now(),
				publishedId: body.action === "reject" ? null : (body.replaceId ?? id),
			};
			return route.fulfill({ json: record });
		}
		if (url.pathname === "/api/review/submissions") {
			if (options.fail)
				return route.fulfill({
					status: 503,
					json: { error: "The queue could not load. Try again shortly." },
				});
			return route.fulfill({
				json: {
					data: options.empty ? [] : [record],
					total: options.empty ? 0 : 1,
					page: 1,
				},
			});
		}
		return route.fulfill({
			json: {
				...record,
				duplicates: [
					{
						...entry,
						_id: "existing",
						description:
							"Existing Razor rotation with different energy assumptions.",
					},
				],
			},
		});
	});
	return decisions;
}

async function signIn(page: Page, destination = "/review") {
	await page.goto(destination);
	await page.getByLabel("Username", { exact: true }).fill("reviewer");
	await page.getByLabel("Password", { exact: true }).fill("test-password-only");
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("public submission validates the failed field and shows the saved receipt", async ({
	db,
}) => {
	let received: Record<string, string> | null = null;
	await db.page.route("**/api/submissions**", async (route) => {
		if (route.request().method() === "POST") {
			const body = route.request().postDataJSON();
			if (!body.link)
				return route.fulfill({
					status: 400,
					json: {
						field: "link",
						error: "Use a full HTTPS simulation link from KQM or gcsim.",
					},
				});
			received = body;
			return route.fulfill({ status: 201, json: initial() });
		}
		return route.fulfill({ json: initial() });
	});
	await db.page.goto("/submit");
	await db.page
		.getByRole("button", { name: "Submit for review", exact: true })
		.click();
	await expect(
		db.page.getByLabel("Simulation link", { exact: true }),
	).toBeFocused();
	await expect(
		db.page.getByLabel("Simulation link", { exact: true }),
	).toHaveAttribute("aria-invalid", "true");
	await db.page
		.getByLabel("Simulation link", { exact: true })
		.fill("https://gcsim.app/sh/example");
	await db.page.getByLabel("Display name", { exact: true }).fill("KQM tester");
	await db.page
		.getByLabel("Simulation description", { exact: true })
		.fill(entry.description);
	await db.page
		.getByRole("button", { name: "Submit for review", exact: true })
		.click();
	await expect(db.page).toHaveURL(new RegExp(`/submission/${id}$`));
	await expect(
		db.page.getByRole("heading", { name: "Submitted for review" }),
	).toBeVisible();
	await db.page.getByText("View character builds", { exact: true }).click();
	await expect(
		db.page.getByText("Serpent Spine · R1", { exact: true }),
	).toBeVisible();
	expect(received?.author).toBe("KQM tester");
	expect(received?.requestId).toMatch(/^[\da-f-]{36}$/);
	db.console.assertNoCrashes();
});

test("reviewer signs in, approves through a real action, and signs out", async ({
	db,
}) => {
	const decisions = await reviewRoutes(db.page);
	await signIn(db.page);
	await db.page
		.getByRole("link", { name: "Open review", exact: false })
		.click();
	await expect(
		db.page.getByRole("heading", { name: "Review submission", exact: true }),
	).toBeVisible();
	await db.page
		.getByRole("button", { name: "Approve submission", exact: true })
		.focus();
	await db.page.keyboard.press("Enter");
	await expect(db.page.getByRole("dialog")).toBeVisible();
	await db.page.keyboard.press("Escape");
	await expect(db.page.getByRole("dialog")).not.toBeVisible();
	await expect(
		db.page.getByRole("button", { name: "Approve submission", exact: true }),
	).toBeFocused();
	await db.page.keyboard.press("Enter");
	await db.page
		.getByRole("button", { name: "Approve and publish", exact: true })
		.click();
	await expect(
		db.page.getByRole("heading", { name: "Published to KQM" }),
	).toBeVisible();
	expect(decisions).toEqual([{ action: "approve", reason: "" }]);
	await db.page.getByRole("button", { name: "Sign out", exact: true }).click();
	await expect(
		db.page.getByRole("heading", { name: "Sign in to review" }),
	).toBeVisible();
	await expect(
		db.page.getByText("Published to KQM", { exact: true }),
	).not.toBeVisible();
	expect(
		await db.page.evaluate(
			() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage),
		),
	).not.toContain("test-password-only");
	db.console.assertNoCrashes();
});

test("reject requires a note and keeps the review decision visible", async ({
	db,
}) => {
	const decisions = await reviewRoutes(db.page);
	await signIn(db.page, `/review/${id}`);
	await db.page
		.getByRole("button", { name: "Reject submission", exact: true })
		.click();
	const dialog = db.page.getByRole("dialog");
	await dialog
		.getByRole("button", { name: "Reject submission", exact: true })
		.click();
	await expect(dialog.getByLabel("Review note (required)")).toBeFocused();
	expect(decisions).toHaveLength(0);
	await dialog
		.getByLabel("Review note (required)")
		.fill("Explain the energy assumptions before resubmitting.");
	await dialog
		.getByRole("button", { name: "Reject submission", exact: true })
		.click();
	await expect(
		db.page.getByText("Explain the energy assumptions before resubmitting.", {
			exact: true,
		}),
	).toBeVisible();
	await expect(db.page.getByText("Rejected", { exact: true })).toBeVisible();
	expect(decisions[0].action).toBe("reject");
	db.console.assertNoCrashes();
});

test("replacement names the old entry and keeps its viewer link", async ({
	db,
}) => {
	const decisions = await reviewRoutes(db.page);
	await signIn(db.page, `/review/${id}`);
	await db.page
		.getByRole("button", { name: "Replace this entry", exact: false })
		.click();
	const dialog = db.page.getByRole("dialog");
	await expect(dialog).toContainText(
		"Existing Razor rotation with different energy assumptions.",
	);
	await dialog
		.getByLabel("Review note (required)")
		.fill("The new rotation uses corrected gear.");
	await dialog.getByRole("button", { name: "Replace and publish" }).click();
	await expect(
		db.page.getByRole("link", { name: "View published simulation" }),
	).toHaveAttribute("href", "/db/existing");
	await expect(
		db.page.getByText("No other published simulations use this team.", {
			exact: true,
		}),
	).toBeVisible();
	await expect(
		db.page.getByText("You can approve this submission as a new entry.", {
			exact: true,
		}),
	).not.toBeVisible();
	expect(decisions[0].replaceId).toBe("existing");
	db.console.assertNoCrashes();
});

test("queue errors can be retried and empty state has a next action", async ({
	db,
}) => {
	const behavior = { fail: true, empty: true };
	await reviewRoutes(db.page, behavior);
	await signIn(db.page);
	await expect(db.page.getByRole("alert")).toContainText("Try again shortly");
	behavior.fail = false;
	await db.page.getByRole("button", { name: "Try again", exact: true }).click();
	await expect(
		db.page.getByRole("heading", { name: "No submissions waiting" }),
	).toBeVisible();
	await expect(
		db.page.getByRole("button", { name: "Refresh queue" }),
	).toBeVisible();
	await db.page
		.getByText("Import an existing tag helper submission", { exact: true })
		.click();
	await expect(
		db.page.getByLabel("Tag helper link", { exact: true }),
	).toBeVisible();
	db.console.assertNoCrashes();
});

test("submission and review stay usable at 320px and 200% zoom", async ({
	db,
}) => {
	await reviewRoutes(db.page);
	await db.page.setViewportSize({ width: 320, height: 800 });
	await db.page.goto("/submit");
	await expect(
		db.page.getByRole("button", { name: "Submit for review" }),
	).toBeVisible();
	expect(
		await db.page.evaluate(() => document.documentElement.scrollWidth),
	).toBeLessThanOrEqual(320);
	await signIn(db.page, `/review/${id}`);
	await expect(
		db.page.getByRole("button", { name: "Approve submission" }),
	).toBeVisible();
	expect(
		await db.page.evaluate(() => document.documentElement.scrollWidth),
	).toBeLessThanOrEqual(320);
	await db.page.getByRole("button", { name: "Approve submission" }).click();
	await expect(db.page.getByRole("dialog")).toBeVisible();
	expect(
		await db.page
			.getByRole("dialog")
			.evaluate((element) => element.scrollWidth <= element.clientWidth),
	).toBe(true);
	await db.page.keyboard.press("Escape");
	await db.page.setViewportSize({ width: 1280, height: 900 });
	await db.page.evaluate(() => {
		document.documentElement.style.zoom = "2";
	});
	await expect(
		db.page.getByRole("button", { name: "Approve submission" }),
	).toBeVisible();
	expect(
		await db.page.evaluate(() => document.documentElement.scrollWidth),
	).toBeLessThanOrEqual(1280);
	db.console.assertNoCrashes();
});
