import { Users } from 'lucide-react';

const KundenKarte = () => {
  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-8 h-8 text-red-600" />
            <h1 className="text-3xl font-bold text-gray-900">Kunden-Karte</h1>
          </div>
          <p className="text-gray-600 mt-2">
            Übersicht aller Kundenstandorte auf der Google Maps-Karte
          </p>
        </div>

        {/* Google Maps Karte */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="w-full" style={{ minHeight: '600px' }}>
            <iframe
              src="https://www.google.com/maps/d/embed?mid=12dUIjodqsirnue_3WH14WyhW442Oh2s&ehbc=2E312F"
              width="100%"
              height="600"
              style={{ border: 0, borderRadius: '8px' }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Kunden-Karte"
            />
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">Hinweis:</p>
              <p>
                Diese Karte zeigt alle Kundenstandorte. Sie können in der Karte zoomen, verschieben und auf Marker klicken, 
                um weitere Details zu sehen.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KundenKarte;
