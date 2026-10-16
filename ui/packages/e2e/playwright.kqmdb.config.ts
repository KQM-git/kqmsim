import { defineConfig } from "@playwright/test";
import dbConfig from "./playwright.db.config";

// Use the production CSS bundle so missing Tailwind sources fail these checks.
export default defineConfig({
	...dbConfig,
	testDir: "./tests/kqmdb",
	use: { ...dbConfig.use, baseURL: "http://127.0.0.1:5274" },
	webServer: {
		command:
			"pnpm --filter @gcsim/kqmdb exec vite preview --host 127.0.0.1 --port 5274 --strictPort",
		url: "http://127.0.0.1:5274",
		reuseExistingServer: !process.env.CI,
	},
});
