import { useState } from 'react';
import { FileText, FileCheck, Truck } from 'lucide-react';
import { DokumentTyp } from '../../types/bestellabwicklung';
import AngebotTab from './AngebotTab';
import LieferscheinTab from './LieferscheinTab';
import RechnungTab from './RechnungTab';

const Bestellabwicklung = () => {
  const [activeTab, setActiveTab] = useState<DokumentTyp>('angebot');

  const tabs = [
    { id: 'angebot' as DokumentTyp, label: 'Angebot', icon: FileCheck, color: 'from-blue-600 to-cyan-600' },
    { id: 'lieferschein' as DokumentTyp, label: 'Lieferschein', icon: Truck, color: 'from-green-600 to-emerald-600' },
    { id: 'rechnung' as DokumentTyp, label: 'Rechnung', icon: FileText, color: 'from-red-600 to-orange-600' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-red-500 to-orange-600 rounded-xl shadow-lg">
            <FileText className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Bestellabwicklung</h1>
            <p className="text-gray-600 mt-1">Angebote, Lieferscheine und Rechnungen erstellen</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 overflow-hidden">
        <div className="flex border-b border-gray-200">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-3 px-6 py-4 font-semibold transition-all ${
                  isActive
                    ? 'bg-gradient-to-r ' + tab.color + ' text-white shadow-lg'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'angebot' && <AngebotTab />}
        {activeTab === 'lieferschein' && <LieferscheinTab />}
        {activeTab === 'rechnung' && <RechnungTab />}
      </div>
    </div>
  );
};

export default Bestellabwicklung;
