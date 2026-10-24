import React from 'react';
import { Dashboard, DashboardProps } from '../dashboard/Dashboard.tsx';

export interface OverviewViewProps extends DashboardProps {}

export const OverviewView: React.FC<OverviewViewProps> = (props) => {
  return <Dashboard {...props} />;
};

export default OverviewView;
