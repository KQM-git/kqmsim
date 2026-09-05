import {Switch} from '@blueprintjs/core';
import React from 'react';
import {useTranslation} from 'react-i18next';
import ServerMode from './ServerMode';
import WasmMode from './WasmMode';

const serverModeKey = 'use-server-mode';

const App = ({}) => {
  const {t} = useTranslation();
  const [serverMode, setServerMode] = React.useState<boolean>((): boolean => {
    return localStorage.getItem(serverModeKey) === 'true';
  });
  React.useEffect(() => {
    localStorage.setItem(serverModeKey, serverMode.toString());
  }, [serverMode]);

  const children = (
    <Switch
      checked={serverMode}
      onChange={() => setServerMode(!serverMode)}
      labelElement={
        <span>
          {t(
            serverMode
              ? 'simple.server_mode_disable'
              : 'simple.server_mode_enable',
          )}
        </span>
      }
    />
  );

  return (
    <>
      <header className="flex items-center gap-3 px-4 py-3 border-b border-[var(--kqm-border)] bg-bp-header-color">
        <a href="https://keqingmains.com" aria-label="KQM website">
          <img src="/kqm-logo.png" alt="KQM" width="48" height="48" className="object-contain" />
        </a>
        <a href="/" className="text-xl font-bold !text-white">KQM Sim</a>
      </header>
      {serverMode ? (
        <ServerMode>{children}</ServerMode>
      ) : (
        <WasmMode>{children}</WasmMode>
      )}
    </>
  );
};

export default App;
