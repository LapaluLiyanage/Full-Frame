import React from 'react';
import Scene from './components/3d/Scene';
import Overlay from './components/ui/Overlay';

function App() {
  return (
    <>
      {/* 3D Background */}
      <Scene />
      
      {/* HTML UI Overlay */}
      <Overlay />
    </>
  );
}

export default App;
