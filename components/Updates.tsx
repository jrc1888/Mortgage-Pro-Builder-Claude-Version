import React from 'react';
import { SharedHeader } from './SharedHeader';

interface Props {
  onNavigateHome: () => void;
  userEmail?: string | null;
}

export const Updates: React.FC<Props> = ({ onNavigateHome, userEmail }) => {
  return (
    <div className="h-screen w-screen bg-slate-50 flex flex-col">
      <SharedHeader 
        onNavigateHome={onNavigateHome} 
        title="Client Updates"
        userEmail={userEmail}
        variant="dark"
      />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">Client Updates</h2>
            <p className="text-slate-600 mb-6">
              This application is currently under development. 
              <br />
              You'll be able to send text and email updates to clients as loans progress.
            </p>
            <div className="inline-block px-4 py-2 bg-slate-100 text-slate-500 text-sm font-semibold rounded-full">
              Coming Soon
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

