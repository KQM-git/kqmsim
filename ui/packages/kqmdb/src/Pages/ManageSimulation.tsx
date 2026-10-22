import { TeamTile } from "@gcsim/components";
import { Button } from "@gcsim/primitives";
import type { db } from "@gcsim/types";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { team } from "../lib/entry";
import { ApiError, fullDate, submissionApi } from "../lib/submissions";
import { FlowError, TeamNames } from "../SharedComponents/SubmissionDetails";

type Simulation = {
	id: string;
	entry: db.Entry;
	version: string;
	deletedAt: number | null;
	deletedBy: string | null;
	deletionReason: string | null;
};

export default function ManageSimulation({
	id,
	authorization,
}: {
	id: string;
	authorization: string;
}) {
	const [data, setData] = useState<Simulation | null>(null);
	const [error, setError] = useState("");
	const [attempt, setAttempt] = useState(0);
	const [reason, setReason] = useState("");
	const [confirm, setConfirm] = useState(false);
	const [noteError, setNoteError] = useState(false);
	const heading = useRef<HTMLHeadingElement>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: attempt reloads the current published record.
	useEffect(() => {
		const controller = new AbortController();
		setError("");
		setData(null);
		submissionApi<Simulation>(
			`/api/review/simulations/${encodeURIComponent(id)}`,
			{ authorization, signal: controller.signal },
		)
			.then((next) => {
				if (!controller.signal.aborted) setData(next);
			})
			.catch((cause) => {
				if (!controller.signal.aborted) setError(cause.message);
			});
		return () => controller.abort();
	}, [id, authorization, attempt]);
	function requestDeletion(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (reason.trim().length < 3) {
			setNoteError(true);
			event.currentTarget.querySelector("textarea")?.focus();
			return;
		}
		setNoteError(false);
		setConfirm(true);
	}
	return (
		<>
			<header className="flow-heading">
				<h1 ref={heading} tabIndex={-1}>
					Manage simulation
				</h1>
				<p className="font-g-mono text-g-sm break-all">{id}</p>
			</header>
			{error && (
				<FlowError message={error} retry={() => setAttempt((n) => n + 1)} />
			)}
			{!data && !error && <p role="status">Loading simulation…</p>}
			{data && (
				<div className="submission-columns">
					<section
						className="flow-panel submission-summary"
						aria-label="Published simulation"
					>
						<div className="submission-dps">
							<strong>
								{Math.round(
									data.entry.summary?.mean_dps_per_target ?? 0,
								).toLocaleString()}
							</strong>
							<span>DPS per target</span>
						</div>
						<div className="mt-6 max-w-[520px]">
							<TeamTile chars={team(data.entry)} className="w-full" />
						</div>
						<h2 className="mt-4 font-g-display text-g-h3 font-semibold">
							<TeamNames entry={data.entry} />
						</h2>
						<p className="mt-4 whitespace-pre-wrap break-words leading-relaxed">
							{data.entry.description}
						</p>
						<p className="mt-3 text-g-sm text-g-ink-dim">
							By <bdi>{data.entry.submitter}</bdi>
						</p>
						{!data.deletedAt && (
							<Button variant="secondary" className="mt-6" asChild>
								<a href={`/db/${id}`} target="_blank" rel="noreferrer">
									Open result viewer{" "}
									<span className="sr-only">in a new tab</span>↗
								</a>
							</Button>
						)}
					</section>
					{data.deletedAt ? (
						<section
							className="flow-panel self-start"
							aria-labelledby="deleted-heading"
						>
							<h2
								id="deleted-heading"
								tabIndex={-1}
								className="font-g-display text-g-h3 font-semibold"
							>
								Simulation deleted
							</h2>
							<p className="mt-3" role="status">
								This simulation is no longer in the public database. Its
								database viewer link is unavailable.
							</p>
							<p className="mt-4 text-g-sm text-g-ink-dim">
								Deleted {fullDate(data.deletedAt)} by{" "}
								<bdi>{data.deletedBy}</bdi>
							</p>
							<p className="mt-4 whitespace-pre-wrap break-words">
								{data.deletionReason}
							</p>
							<p className="mt-4 text-g-sm text-g-ink-dim">
								The saved data and review history are kept for recovery by the
								site administrator.
							</p>
							<Button variant="secondary" className="mt-6" asChild>
								<Link href="/review">Return to review queue</Link>
							</Button>
						</section>
					) : (
						<form
							className="flow-panel review-decision self-start"
							onSubmit={requestDeletion}
							noValidate
						>
							<h2 className="font-g-display text-g-h3 font-semibold">
								Delete from database
							</h2>
							<p className="mt-3 text-g-sm text-g-ink-dim">
								Remove this simulation from public searches and disable its
								database viewer link. Imports will not restore it.
							</p>
							<div className="mt-6">
								<label htmlFor="deletion-reason">
									Deletion reason (required)
								</label>
								<textarea
									id="deletion-reason"
									name="reason"
									rows={4}
									required
									minLength={3}
									maxLength={2000}
									value={reason}
									onChange={(event) => setReason(event.target.value)}
									aria-invalid={noteError}
									aria-describedby="deletion-note-error"
								/>
								<p id="deletion-note-error" className="field-error">
									{noteError
										? "Enter a reason with at least 3 characters."
										: ""}
								</p>
							</div>
							<Button type="submit" variant="destructive" className="mt-5">
								Delete simulation
							</Button>
						</form>
					)}
				</div>
			)}
			{data && confirm && (
				<DeleteDialog
					data={data}
					reason={reason.trim()}
					authorization={authorization}
					close={() => setConfirm(false)}
					reload={() => {
						setConfirm(false);
						setAttempt((n) => n + 1);
						heading.current?.focus();
					}}
					saved={(next) => {
						setData(next);
						setConfirm(false);
						requestAnimationFrame(() =>
							document.getElementById("deleted-heading")?.focus(),
						);
					}}
				/>
			)}
		</>
	);
}

function DeleteDialog({
	data,
	reason,
	authorization,
	close,
	reload,
	saved,
}: {
	data: Simulation;
	reason: string;
	authorization: string;
	close: () => void;
	reload: () => void;
	saved: (next: Simulation) => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const trigger = useRef(document.activeElement as HTMLElement | null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [stale, setStale] = useState(false);
	useEffect(() => {
		const element = dialog.current;
		element?.showModal();
		return () => {
			element?.close();
			trigger.current?.focus();
		};
	}, []);
	async function remove() {
		setBusy(true);
		setError("");
		try {
			saved(
				await submissionApi<Simulation>(
					`/api/review/simulations/${data.id}/delete`,
					{ authorization, body: { reason, version: data.version } },
				),
			);
		} catch (cause) {
			setStale(cause instanceof ApiError && cause.status === 409);
			setError(
				cause instanceof ApiError
					? cause.message
					: "The deletion could not be confirmed. Reload the simulation to check its status.",
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<dialog
			ref={dialog}
			className="submission-flow review-flow decision-dialog"
			aria-labelledby="delete-title"
			aria-describedby="delete-description"
			onCancel={(event) => {
				if (busy) event.preventDefault();
				else close();
			}}
		>
			<h2 id="delete-title" className="font-g-display text-g-h2 font-semibold">
				Delete this simulation?
			</h2>
			<p id="delete-description" className="mt-3 text-g-ink-dim">
				The simulation will leave the public database. Its database viewer link
				will stop working. The saved data and review history will be kept.
			</p>
			<p className="mt-4 font-semibold">
				<TeamNames entry={data.entry} />
			</p>
			<p className="mt-2 font-g-mono text-g-sm break-all">{data.id}</p>
			<p className="mt-4 whitespace-pre-wrap break-words">{reason}</p>
			{error && <FlowError message={error} retry={reload} />}
			<div className="mt-6 flex flex-wrap justify-end gap-3">
				<Button
					variant="secondary"
					type="button"
					disabled={busy}
					onClick={close}
				>
					Cancel
				</Button>
				<Button
					variant="destructive"
					type="button"
					disabled={busy || stale}
					onClick={remove}
				>
					{busy ? "Deleting…" : "Delete simulation"}
				</Button>
			</div>
			<p role="status" className="sr-only">
				{busy ? "Deleting simulation." : ""}
			</p>
		</dialog>
	);
}
