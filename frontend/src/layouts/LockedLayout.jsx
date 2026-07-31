import React from 'react';
import { Outlet } from 'react-router-dom';

const LockedLayout = () => {
  return (
    <div className="locked-layout">
      <Outlet />
    </div>
  );
};

export default LockedLayout;
