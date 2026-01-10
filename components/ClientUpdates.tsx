import React from 'react';
import { SharedHeader } from './SharedHeader';

interface Props {
  onNavigateHome: () => void;
  userEmail?: string | null;
}

export const ClientUpdates: React.FC<Props> = ({ onNavigateHome, userEmail }) => {
  return (
    <div className="h-screen w-screen bg-slate-50 flex flex-col">
      <SharedHeader 
        title="ClientUpdates" 
        onNavigateHome={onNavigateHome}
        userEmail={userEmail}
      />
      
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Client Updates</h2>
            <p className="text-slate-600">
              Manage and track client updates and communications.
            </p>
            <p className="text-slate-500 text-sm mt-4 italic">
              This feature is coming soon.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

