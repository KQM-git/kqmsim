import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { installDbRoutes } from "../../src/db-fixtures";

const result = JSON.parse(
	readFileSync(
		new URL("../../../kqmdb/test-fixtures/razor-result.json", import.meta.url),
		"utf8",
	),
);
const entry = {
	_id: "kqm-test",
	description: "Razor team. A saved rotation with complete energy assumptions.",
	submitter: "KQM tester",
	config: result.config_file,
	summary: {
		char_names: result.character_details.map((c: { name: string }) => c.name),
		team: result.character_details,
		mean_dps_per_target: 66610,
		sim_duration: result.statistics.duration,
		target_count: 1,
		mode: 2,
	},
};
const record = {
	id: entry._id,
	entry,
	status: "pending",
	submittedAt: 1790000000000,
	sourceUrl: "https://gcsim.app/sh/example",
};

async function setup(page: Page) {
	await installDbRoutes(page);
	const behavior = { fail: false };
	const queries: URLSearchParams[] = [];
	const decisions: unknown[] = [];
	await page.route("**/api/review/**", async (route) => {
		const request = route.request();
		if (
			request.headers().authorization !==
			`Basic ${Buffer.from("reviewer:test-only").toString("base64")}`
		) {
			return route.fulfill({
				status: 401,
				json: { error: "Check your credentials and try again." },
			});
		}
		const url = new URL(request.url());
		if (url.pathname.endsWith("/session"))
			return route.fulfill({ json: { reviewer: "reviewer" } });
		if (url.pathname.endsWith("/decision")) {
			decisions.push(request.postDataJSON());
			return route.fulfill({
				json: {
					...record,
					status: "rejected",
					reason: "Explain the energy assumptions.",
				},
			});
		}
		if (url.pathname === "/api/review/submissions") {
			queries.push(url.searchParams);
			if (behavior.fail)
				return route.fulfill({
					status: 503,
					json: { error: "The queue could not load. Try again shortly." },
				});
			const empty =
				url.searchParams.get("search") === "no-match" ||
				url.searchParams.get("status") === "approved";
			return route.fulfill({
				json: { data: empty ? [] : [record], total: empty ? 0 : 26 },
			});
		}
		return route.fulfill({
			json: {
				...record,
				duplicates: [
					{
						...entry,
						_id: "existing",
						description: "Existing rotation with different gear.",
					},
				],
			},
		});
	});
	await page.goto("/review");
	await page.getByLabel("Username", { exact: true }).fill("reviewer");
	await page.getByLabel("Password", { exact: true }).fill("test-only");
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "Review queue", exact: true }),
	).toBeFocused();
	return { queries, behavior, decisions };
}

test("reviewers confirm a deletion, handle conflicts, and see the removed state", async ({
	page,
}) => {
	await setup(page);
	const published = { ...record, status: "approved", publishedId: entry._id };
	await page.route("**/api/review/submissions/kqm-test", (route) =>
		route.fulfill({ json: published }),
	);
	const managed = {
		id: entry._id,
		entry,
		version: "original-version",
		deletedAt: null as number | null,
		deletedBy: null as string | null,
		deletionReason: null as string | null,
	};
	const deletions: { reason: string; version: string }[] = [];
	let conflict = true;
	await page.route("**/api/review/simulations/kqm-test**", (route) => {
		if (route.request().method() === "POST") {
			deletions.push(route.request().postDataJSON());
			if (conflict)
				return route.fulfill({
					status: 409,
					json: {
						error:
							"This simulation changed. Reload the page before you delete it.",
					},
				});
			managed.deletedAt = 1790000000000;
			managed.deletedBy = "reviewer";
			managed.deletionReason = deletions.at(-1)?.reason ?? "";
		}
		return route.fulfill({ json: managed });
	});
	await page.getByRole("link", { name: /Open review/ }).click();
	await page
		.getByRole("link", { name: "Manage published simulation", exact: true })
		.click();
	await expect(
		page.getByRole("heading", { name: "Manage simulation", exact: true }),
	).toBeFocused();
	await page.setViewportSize({ width: 320, height: 800 });
	const remove = page.getByRole("button", {
		name: "Delete simulation",
		exact: true,
	});
	await remove.click();
	await expect(page.getByLabel("Deletion reason (required)")).toBeFocused();
	await expect(page.getByRole("dialog")).not.toBeVisible();
	expect(deletions).toHaveLength(0);
	await page
		.getByLabel("Deletion reason (required)")
		.fill("Approved in error.");
	await remove.click();
	const dialog = page.getByRole("dialog", { name: "Delete this simulation?" });
	await expect(dialog).toContainText("kqm-test");
	await expect(dialog).toContainText("Razor");
	await expect(dialog).toContainText("Approved in error.");
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
	await page.keyboard.press("Escape");
	await expect(remove).toBeFocused();
	expect(deletions).toHaveLength(0);
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.evaluate(() => {
		document.documentElement.style.fontSize = "200%";
	});
	await remove.click();
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
	await dialog
		.getByRole("button", { name: "Delete simulation", exact: true })
		.click();
	await expect(dialog.getByRole("alert")).toContainText(
		"This simulation changed.",
	);
	await expect(
		dialog.getByRole("button", { name: "Delete simulation", exact: true }),
	).toBeDisabled();
	conflict = false;
	managed.version = "updated-version";
	await dialog.getByRole("button", { name: "Try again", exact: true }).click();
	await expect(dialog).not.toBeVisible();
	await remove.click();
	await dialog
		.getByRole("button", { name: "Delete simulation", exact: true })
		.click();
	await expect(
		page.getByRole("heading", { name: "Simulation deleted", exact: true }),
	).toBeFocused();
	await expect(
		page.getByText("This simulation is no longer in the public database.", {
			exact: false,
		}),
	).toBeVisible();
	await expect(remove).not.toBeVisible();
	expect(deletions).toEqual([
		{ reason: "Approved in error.", version: "original-version" },
		{ reason: "Approved in error.", version: "updated-version" },
	]);
});

test("search, date order, and pagination persist through a review", async ({
	page,
}) => {
	const { queries } = await setup(page);
	await expect(page.getByRole("status")).toContainText("26 submissions");
	await expect(page.getByLabel("Date order")).toHaveValue("newest");
	await page.getByRole("button", { name: "Next page", exact: true }).click();
	await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
	await page.getByLabel("Date order").selectOption("oldest");
	await expect(page.getByText("Page 1 of 2", { exact: true })).toBeVisible();
	await page.getByLabel("Search submissions", { exact: true }).fill("Razor");
	await page.getByLabel("Search submissions", { exact: true }).press("Enter");
	await expect.poll(() => queries.at(-1)?.get("search")).toBe("Razor");
	await expect.poll(() => queries.at(-1)?.get("sort")).toBe("oldest");
	await page.getByRole("link", { name: /Open review/ }).click();
	await expect(
		page.getByRole("heading", { name: "Review submission", exact: true }),
	).toBeFocused();
	await page.getByRole("link", { name: "← Review queue", exact: true }).click();
	await expect(
		page.getByLabel("Search submissions", { exact: true }),
	).toHaveValue("Razor");
	await expect(page.getByLabel("Date order")).toHaveValue("oldest");
	await expect(page.locator(".queue-row")).toBeVisible();
	const gaps = {
		importGap: await page
			.locator("details.flow-panel")
			.evaluate((el) => getComputedStyle(el).marginTop),
		resultsGap: await page
			.locator(".queue-results-summary")
			.evaluate((el) => getComputedStyle(el).marginBottom),
	};
	expect(gaps).toEqual({ importGap: "32px", resultsGap: "16px" });
	await page.getByLabel("Search submissions", { exact: true }).fill("no-match");
	await page.getByLabel("Search submissions", { exact: true }).press("Enter");
	await expect(
		page.getByRole("heading", { name: "No results for “no-match”" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Clear search", exact: true }).click();
	await expect(page.locator(".queue-row")).toBeVisible();
});

test("review spacing and keyboard decisions work at narrow widths and enlarged text", async ({
	page,
}) => {
	const { decisions } = await setup(page);
	await page.setViewportSize({ width: 320, height: 800 });
	await expect(page.getByLabel("Date order")).toBeVisible();
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
	await page.getByRole("link", { name: /Open review/ }).click();
	await expect(
		page.getByRole("button", { name: "Approve submission", exact: true }),
	).toBeVisible();
	expect(
		await page
			.locator('section[aria-labelledby="matching-teams"]')
			.evaluate((el) => getComputedStyle(el).marginTop),
	).toBe("40px");
	expect(
		await page
			.locator(".review-decision p")
			.last()
			.evaluate((el) => getComputedStyle(el).marginTop),
	).toBe("20px");
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
	await page
		.getByRole("button", { name: "Approve submission", exact: true })
		.focus();
	await page.keyboard.press("Enter");
	await expect(page.getByRole("dialog")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(
		page.getByRole("button", { name: "Approve submission", exact: true }),
	).toBeFocused();
	await page
		.getByRole("button", { name: "Reject submission", exact: true })
		.click();
	const dialog = page.getByRole("dialog");
	await dialog
		.getByRole("button", { name: "Reject submission", exact: true })
		.click();
	await expect(dialog.getByLabel("Review note (required)")).toBeFocused();
	expect(decisions).toHaveLength(0);
	await page.keyboard.press("Escape");
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.evaluate(() => {
		document.documentElement.style.fontSize = "200%";
	});
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
	await page
		.getByRole("button", { name: "Reject submission", exact: true })
		.click();
	await expect(dialog).toBeVisible();
	await page.keyboard.press("Escape");
});

test("queue errors and empty statuses have a recovery path", async ({
	page,
}) => {
	const { behavior } = await setup(page);
	behavior.fail = true;
	await page.getByLabel("Date order").selectOption("oldest");
	await expect(page.getByRole("alert")).toContainText("Try again shortly");
	behavior.fail = false;
	await page.getByRole("button", { name: "Try again", exact: true }).click();
	await expect(page.locator(".queue-row")).toBeVisible();
	await page.getByLabel("Submission status").selectOption("approved");
	await expect(
		page.getByRole("heading", { name: "No approved submissions" }),
	).toBeVisible();
	await page
		.getByRole("button", { name: "View pending submissions", exact: true })
		.click();
	await expect(page.locator(".queue-row")).toBeVisible();
});
