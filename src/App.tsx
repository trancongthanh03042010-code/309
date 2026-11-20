import React from 'react';
import { OSProvider } from './context/OSContext';
import { OSShell } from './components/os/OSShell';

export default function App() {
  return (
    <OSProvider>
      <OSShell />
    </OSProvider>
  );
}
