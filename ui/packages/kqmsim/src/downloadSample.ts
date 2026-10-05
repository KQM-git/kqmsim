import type { Sample } from "@gcsim/types";

export async function downloadSample(sample: Sample) {
	// Match the compressed JSON format used by the gcsim sample viewer.
	const stream = new Blob([JSON.stringify(sample)]).stream();
	const blob = await new Response(
		stream.pipeThrough(new CompressionStream("deflate")),
	).blob();
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = "sample.gz";
	link.hidden = true;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
