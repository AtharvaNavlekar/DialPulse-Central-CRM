import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Compass, Home } from 'lucide-react';
import { Card } from '../components/ui/Card.tsx';
import { Button } from '../components/ui/Button.tsx';
import { PLATFORM_ROUTES } from '../app/routes.ts';

export const NotFoundPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <Card variant="elevated" rounded="3xl" className="p-6 sm:p-10 text-center space-y-5">
        <div className="w-14 h-14 bg-teal-50 border border-teal-200 rounded-[16px] flex items-center justify-center mx-auto text-[#00695C]">
          <Compass className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-[8px] bg-slate-100 border border-slate-200 text-[10px] font-mono font-bold text-slate-700 tracking-wider uppercase">
            <span>HTTP 404</span>
            <span>·</span>
            <span>Route Not Found</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-display font-extrabold text-slate-900">
            Platform Route Unavailable
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
            The requested address does not map to an active DialPulse Central CRM view or is reserved for an upcoming implementation sprint.
          </p>
        </div>

        <div className="max-w-md mx-auto p-3 rounded-[12px] bg-slate-50 border border-slate-200 text-xs font-mono text-slate-700 break-all">
          Requested path: <span className="font-semibold text-slate-900">{location.pathname}</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button
            variant="outlined"
            size="md"
            icon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate(-1)}
          >
            Go Back
          </Button>
          <Button
            variant="filled"
            size="md"
            icon={<Home className="w-4 h-4" />}
            onClick={() => navigate(PLATFORM_ROUTES.OVERVIEW)}
          >
            Return to Dashboard
          </Button>
        </div>
      </Card>
    </div>
  );
};
