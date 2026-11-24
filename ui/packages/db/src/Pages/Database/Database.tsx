import { craftQuery, type DbQuery } from "SharedHooks/databaseQuery";
import { Spinner } from "@gcsim/primitives";
import type { db } from "@gcsim/types";
import axios from "axios";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
	initialFilter as defaultFilter,
	FilterContext,
	FilterDispatchContext,
	type FilterState,
	filterReducer,
} from "../../SharedComponents/FilterComponents/Filter.utils";
import { DBView } from "./DBVIew";

type Props = {
	initialFilter?: FilterState;
};

export const Database = ({ initialFilter = defaultFilter }: Props) => {
	const [filter, dispatch] = useReducer(filterReducer, initialFilter);
	const [data, setData] = useState<db.Entry[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [totalCount, setTotalCount] = useState<number>(0);
	const hasMore = data.length < totalCount;
	const [page, setPage] = useState<number>(1);
	const abortController = useRef(new AbortController());

	// TODO(react19): drop this useCallback (inline the function) once the React
	// Compiler is enabled — it auto-memoizes. Keep the functional setData
	// updater regardless: it fixes a stale-closure bug, independent of memoization.
	const appendData = useCallback((next: db.Entry[]) => {
		// let d = [ ...data,...next.filter(e => {
		//   return false
		// })]
		setData((prev) => [...prev, ...next]);
	}, []);

	// TODO(react19): drop this useCallback (inline the function) once the React
	// Compiler is enabled — it auto-memoizes. Don't remove it before then:
	// querydb must stay referentially stable or the effect below refetch-loops,
	// and useExhaustiveDependencies is now an error.
	const querydb = useCallback(
		(query: DbQuery, nextPage: number, append: boolean) => {
			axios(`/api/db?q=${encodeURIComponent(JSON.stringify(query))}`, {
				signal: abortController.current.signal,
			})
				.then((resp: { data: { data: db.Entry[]; count?: number } }) => {
					if (resp.data && resp.data.data) {
						setPage(nextPage);
						if (append) {
							appendData(resp.data.data);
						} else {
							setData(resp.data.data);
							setTotalCount(resp.data.count ?? 0);
						}
					} else if (!append) {
						setData([]);
					}
					setIsLoading(false);
				})
				.catch((err) => {
					console.log("error: ", err);
				});
		},
		[appendData],
	);

	useEffect(() => {
		abortController.current.abort();
		abortController.current = new AbortController();
		const query = craftQuery(filter, 1, 25, true);
		querydb(query, 1, false);
	}, [filter, querydb]);

	const fetchData = () => {
		const nextPage = page + 1;
		const query = craftQuery(filter, nextPage, 25, false);
		querydb(query, nextPage, true);
	};

	if (isLoading || !data)
		return (
			<div className="h-screen flex flex-col justify-center items-center">
				<Spinner className="size-12" />
			</div>
		);

	return (
		<FilterContext.Provider value={filter}>
			<FilterDispatchContext.Provider value={dispatch}>
				<DBView
					data={data}
					fetchData={fetchData}
					totalCount={totalCount}
					hasMore={hasMore}
				/>
			</FilterDispatchContext.Provider>
		</FilterContext.Provider>
	);
};
