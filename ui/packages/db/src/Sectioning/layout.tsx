import { Toaster } from "@gcsim/primitives";
import Nav from "./Nav";

export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<>
			<Toaster position="top-right" theme="dark" />
			<Nav />
			{children}
			<footer className="mx-auto mt-10 flex max-w-[1160px] flex-wrap items-center justify-between gap-4 border-t border-g-line-soft px-4 py-6 text-g-sm text-g-ink-dim sm:px-8">
				<p>Genshin Impact and its game assets belong to HoYoverse.</p>
				<nav aria-label="Footer" className="flex gap-5 text-g-accent">
					<a href="https://keqingmains.com/">KQM</a>
					<a href="https://sim.kqm.gg/">KQM Sim</a>
					<a href="https://github.com/KQM-git/kqmsim/tree/codex/kqm-db">
						Source code
					</a>
				</nav>
			</footer>
		</>
	);
}
