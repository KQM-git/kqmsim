import {PreviewCard} from '@gcsim/components';
import '@gcsim/components/src/index.css';
import {SimulationResult} from '@gcsim/types/src/generated/index.model';
import axios from 'axios';
import React from 'react';
import {ErrorBoundary} from 'react-error-boundary';
import {Route, Switch} from 'wouter';

function fallbackRender({error}) {
  return (
    <div id="card" role="alert">
      <input id="has-error" disabled hidden value={JSON.stringify(error)} />
      <p className="text-white">Something went wrong:</p>
      <pre style={{color: 'red'}}>{error.message}</pre>
    </div>
  );
}

const App = ({id, src}: {id: string; src: string}) => {
  const [err, setError] = React.useState<string>('');
  const [data, setData] = React.useState<SimulationResult | undefined>(
    undefined,
  );
  const [completed, setCompleted] = React.useState(false);
  React.useEffect(() => {
    //https://gcsim.app/api/share/db/nFLhjtD9dfFN
    axios
      .get('/api/share/' + src + '/' + id)
      .then((res) => {
        if (res.data) {
          setData(res.data);
        } else {
          setError('unexpected no data');
        }
      })
      .catch((e) => {
        setError(JSON.stringify(e));
      });
  }, []);
  React.useEffect(() => {
    if (!data) return;
    let cancelled = false;
    // Preload SVG gear images and the portrait background as well as img elements.
    const urls = new Set([
      ...Array.from(document.querySelectorAll('img')).map((img) => img.src),
      ...Array.from(document.querySelectorAll('svg image')).map((img) => img.getAttribute('href') ?? ''),
      '/api/assets/misc/overlay.jpg',
    ]);
    Promise.all([...urls].filter(Boolean).map((url) => new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not load preview image'));
      image.src = url;
    }))).then(() => document.fonts.ready).then(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!cancelled) setCompleted(true);
      }));
    }).catch((error) => { if (!cancelled) setError(error.message); });
    return () => { cancelled = true; };
  }, [data]);

  if (err !== '') {
    return (
      <>
        <input id="has-error" disabled hidden value={err} />
        <div>{err}</div>
      </>
    );
  }

  if (data === undefined) {
    return (
      <div id="status" className="disabled">
        no data
      </div>
    );
  }

  return (
    <ErrorBoundary fallbackRender={fallbackRender}>
      {completed ? (
        <span
          className="hidden absolute top-0 left-0"
          id="images_loaded" data-preview-ready="true"></span>
      ) : null}
      <PreviewCard
        data={data}
        className="kqm-preview"
      />
    </ErrorBoundary>
  );
};

const Routes = () => {
  const key = new URLSearchParams(window.location.search).get('key');
  if (key) return <App id={key} src="sh" />;
  return (
    <>
      <Switch>
        <Route path="/db/:id">
          {(params) => <App id={params.id} src="db" />}
        </Route>
        <Route path="/sh/:id">
          {(params) => <App id={params.id} src="sh" />}
        </Route>
        <Route>404 Not Found</Route>
      </Switch>
    </>
  );
};

export default Routes;
