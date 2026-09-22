import { Home } from "Pages/Home";
import { lazy, Suspense, useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { Database } from "./Pages/Database";
import Layout from "./Sectioning/layout";

const Results = lazy(() => import("./Pages/Results"));
export default function App() {
	const [location] = useLocation();

	// wouter's client-side nav preserves window scroll, so the listing can mount at the bottom and
	// make react-infinite-scroll fetch pages forever. Reset scroll on every route change.
	useEffect(() => {
		window.scrollTo(0, 0);
		if (!location.startsWith("/db/")) document.title = "KQM Sim Database";
	}, [location]);

	return (
		<Layout>
			<Switch>
				<Route path="/">
					<Home />
				</Route>
				<Route path="/database">
					<Database />
				</Route>
				<Route path="/db/:id">
					{(params) => (
						<Suspense fallback={<p className="p-8">Loading results…</p>}>
							<Results id={params.id} />
						</Suspense>
					)}
				</Route>
				<Route>
					<main className="p-8 text-center">
						Page not found.{" "}
						<a className="text-g-accent" href="/database">
							Browse the database
						</a>
						.
					</main>
				</Route>
			</Switch>
		</Layout>
	);
}
