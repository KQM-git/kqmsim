import { Button } from "@gcsim/primitives";
import { FaPlay } from "react-icons/fa";

export function SendToSimulator({ config }: { config?: string }) {
	if (!config?.trim()) return null;
	const fragment = new URLSearchParams({ config });
	return (
		<Button size="sm" variant="secondary" asChild>
			<a
				href={`https://sim.kqm.gg/simulator#${fragment}`}
				target="_blank"
				rel="noopener noreferrer"
			>
				<FaPlay size={11} /> Send to KQM Sim
			</a>
		</Button>
	);
}
