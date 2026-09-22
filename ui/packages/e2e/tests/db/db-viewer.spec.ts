import { readFileSync } from "node:fs";
import { expect, test } from "../../src";
import { dbEntries } from "../../src/db-fixtures";

// Public result for the viewer link reported during the KQM launch.
const result = readFileSync(
	new URL("./fixtures/razor-result.json", import.meta.url),
	"utf8",
);
const viewerPath = "/db/wGtDfgdt9n8G";

for (const width of [1280, 390]) {
	test(`viewer shows builds, DPS, charts, and configuration at ${width}px`, async ({
		db,
	}) => {
		await db.page.setViewportSize({ width, height: 844 });
		await db.page.route("**/api/share/db/wGtDfgdt9n8G", (route) =>
			route.fulfill({ contentType: "application/json", body: result }),
		);
		await db.page.route("**/api/db*", (route) =>
			route.fulfill({
				contentType: "application/json",
				body: JSON.stringify({
					data: [{ ...dbEntries[0], _id: "wGtDfgdt9n8G" }],
				}),
			}),
		);
		await db.database.goto();
		await db.database.openInViewerLinks.first().click();
		await expect(db.page).toHaveURL(new RegExp(`${viewerPath}$`));
		await expect(db.page.getByText("66,610", { exact: true })).toBeVisible();
		await expect(
			db.page.getByText("Serpent Spine R1", { exact: true }),
		).toBeVisible();
		await expect(db.page.locator("pre")).toContainText("razor char lvl=90/90");
		await expect(
			db.page.getByText("Character DPS Distribution", { exact: true }),
		).toBeVisible();
		await expect
			.poll(() =>
				db.page.locator('[aria-label="Damage over time graph"] path').count(),
			)
			.toBeGreaterThan(0);
		const pageWidth = await db.page.evaluate(
			() => document.documentElement.scrollWidth,
		);
		expect(pageWidth).toBeLessThanOrEqual(width);
		await db.page.reload();
		await expect(db.page.getByText("66,610", { exact: true })).toBeVisible();
		db.console.assertNoCrashes();
	});
}

test("viewer can retry a failed result request", async ({ db }) => {
	let fail = true;
	await db.page.route("**/api/share/db/wGtDfgdt9n8G", (route) =>
		route.fulfill(
			fail
				? {
						status: 503,
						contentType: "application/json",
						body: '{"error":"Unavailable"}',
					}
				: { contentType: "application/json", body: result },
		),
	);
	await db.page.goto(viewerPath);
	await expect(db.page.getByRole("alert")).toContainText(
		"The results could not load",
	);
	fail = false;
	await db.page.getByRole("button", { name: "Try again" }).click();
	await expect(db.page.getByText("66,610", { exact: true })).toBeVisible();
	db.console.assertNoCrashes();
});

test("missing viewer records show a useful message", async ({ db }) => {
	await db.page.route("**/api/share/db/missing", (route) =>
		route.fulfill({
			status: 404,
			contentType: "application/json",
			body: '{"error":"Not found"}',
		}),
	);
	await db.page.goto("/db/missing");
	await expect(db.page.getByRole("alert")).toContainText(
		"This simulation was not found",
	);
	await db.page.getByRole("link", { name: "← Back to database" }).click();
	await db.database.waitForBrowse();
	db.console.assertNoCrashes();
});
