/**
 * InstandsetzungsauftragDetail - Detailansicht eines Instandsetzungsauftrags
 */

import { useState } from 'react';
import {
  ArrowLeft,
  FileText,
  Download,
  Send,
  CheckCircle2,
  Users,
  Calendar,
  MapPin,
  Trash2,
  ExternalLink,
  User,
  Phone,
} from 'lucide-react';
import {
  Instandsetzungsauftrag,
  InstandsetzungsauftragStatus,
} from '../../types/instandsetzungsauftrag';
import { instandsetzungsauftragService } from '../../services/instandsetzungsauftragService';
import {
  generiereInstandsetzungsauftragPDFPreview,
  generiereInstandsetzungsauftragPDFBlob,
  generiereInstandsetzungsauftragDateiname,
  InstandsetzungsauftragPdfDaten,
} from '../../services/instandsetzungsauftragPdfService';
import { useNavigate } from 'react-router-dom';

interface InstandsetzungsauftragDetailProps {
  auftrag: Instandsetzungsauftrag;
  platzbauerName: string;
  onBack: () => void;
  onStatusChange: () => void;
}

// Workflow-Schritte
const WORKFLOW_STEPS: { status: InstandsetzungsauftragStatus; label: string; icon: any }[] = [
  { status: 'erstellt', label: 'Erstellt', icon: FileText },
  { status: 'gesendet', label: 'Gesendet', icon: Send },
  { status: 'bestaetigt', label: 'Bestätigt', icon: CheckCircle2 },
  { status: 'erledigt', label: 'Erledigt', icon: CheckCircle2 },
];

const InstandsetzungsauftragDetail = ({
  auftrag,
  platzbauerName,
  onBack,
  onStatusChange,
}: InstandsetzungsauftragDetailProps) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Aktueller Schritt im Workflow
  const currentStepIndex = WORKFLOW_STEPS.findIndex(s => s.status === auftrag.status);

  // Zum Projekt navigieren
  const handleProjektOeffnen = (projektId: string) => {
    navigate(`/projektabwicklung/${projektId}`);
  };

  // Status ändern
  const handleStatusChange = async (newStatus: InstandsetzungsauftragStatus) => {
    setLoading(true);
    try {
      await instandsetzungsauftragService.updateStatus(auftrag.id, newStatus);
      onStatusChange();
    } catch (error) {
      console.error('Fehler beim Ändern des Status:', error);
    } finally {
      setLoading(false);
    }
  };

  // PDF generieren
  const getPdfDaten = (): InstandsetzungsauftragPdfDaten => ({
    auftrag,
    platzbauername: platzbauerName,
    platzbauerstrasse: '', // TODO: Aus Platzbauer-Daten laden
    platzbauerPlzOrt: '',
  });

  // PDF Vorschau
  const handlePreview = async () => {
    await generiereInstandsetzungsauftragPDFPreview(getPdfDaten());
  };

  // PDF Download
  const handleDownload = async () => {
    const blob = await generiereInstandsetzungsauftragPDFBlob(getPdfDaten());
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generiereInstandsetzungsauftragDateiname(auftrag, platzbauerName);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Löschen
  const handleDelete = async () => {
    setLoading(true);
    try {
      await instandsetzungsauftragService.deleteAuftrag(auftrag.id);
      onBack();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
    } finally {
      setLoading(false);
    }
  };

  // Statistiken
  const gesamtPlaetze = auftrag.positionen.reduce((sum, p) => sum + p.anzahlPlaetze, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-border rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {auftrag.auftragsnummer}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {platzbauerName} - Saison {auftrag.saisonjahr}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePreview}
            className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-border transition-colors"
          >
            <FileText className="w-4 h-4" />
            Vorschau
          </button>
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            PDF
          </button>
        </div>
      </div>

      {/* Workflow-Status */}
      <div className="p-4 bg-gray-50 dark:bg-dark-bg rounded-xl">
        <div className="flex items-center justify-between">
          {WORKFLOW_STEPS.map((step, index) => {
            const isActive = index === currentStepIndex;
            const isCompleted = index < currentStepIndex;
            const Icon = step.icon;

            return (
              <div key={step.status} className="flex items-center">
                {/* Verbindungslinie */}
                {index > 0 && (
                  <div
                    className={`w-12 h-1 mx-2 rounded ${
                      isCompleted
                        ? 'bg-green-500'
                        : 'bg-gray-200 dark:bg-dark-border'
                    }`}
                  />
                )}

                {/* Schritt */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isActive
                        ? 'bg-amber-500 text-white'
                        : isCompleted
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 dark:bg-dark-border text-gray-400'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span
                    className={`text-xs mt-2 ${
                      isActive
                        ? 'text-amber-600 dark:text-amber-400 font-medium'
                        : isCompleted
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-400'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Status-Aktionen */}
      {auftrag.status !== 'erledigt' && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Status ändern:
          </span>
          {auftrag.status === 'erstellt' && (
            <button
              onClick={() => handleStatusChange('gesendet')}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              Als gesendet markieren
            </button>
          )}
          {auftrag.status === 'gesendet' && (
            <button
              onClick={() => handleStatusChange('bestaetigt')}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              Als bestätigt markieren
            </button>
          )}
          {auftrag.status === 'bestaetigt' && (
            <button
              onClick={() => handleStatusChange('erledigt')}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              Als erledigt markieren
            </button>
          )}
        </div>
      )}

      {/* Info-Karten */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl">
          <Users className="w-5 h-5 text-gray-400 mb-2" />
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {auftrag.positionen.length}
          </div>
          <div className="text-sm text-gray-500">Vereine</div>
        </div>
        <div className="p-4 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl">
          <MapPin className="w-5 h-5 text-gray-400 mb-2" />
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {gesamtPlaetze}
          </div>
          <div className="text-sm text-gray-500">Plätze gesamt</div>
        </div>
        <div className="p-4 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl">
          <Calendar className="w-5 h-5 text-gray-400 mb-2" />
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            {new Date(auftrag.erstelltAm).toLocaleDateString('de-DE')}
          </div>
          <div className="text-sm text-gray-500">Erstellt am</div>
        </div>
      </div>

      {/* Positionen-Tabelle */}
      <div>
        <h4 className="font-medium text-gray-900 dark:text-white mb-3">
          Positionen ({auftrag.positionen.length})
        </h4>
        <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-dark-bg">
              <tr className="text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                <th className="p-3">Pos.</th>
                <th className="p-3">Verein</th>
                <th className="p-3">Adresse</th>
                <th className="p-3 text-center">Plätze</th>
                <th className="p-3">Dienst</th>
                <th className="p-3">Ansprechpartner</th>
                <th className="p-3">Termin</th>
                <th className="p-3 w-20">Projekt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
              {auftrag.positionen.map((pos, index) => (
                <tr key={pos.vereinId} className="bg-white dark:bg-dark-surface">
                  <td className="p-3 text-gray-500">{index + 1}</td>
                  <td className="p-3 font-medium text-gray-900 dark:text-white">
                    {pos.vereinName}
                  </td>
                  <td className="p-3 text-sm text-gray-600 dark:text-gray-300">
                    {pos.adresse ? (
                      <div>
                        {pos.adresse.strasse && <div>{pos.adresse.strasse}</div>}
                        <div>{pos.adresse.plz} {pos.adresse.ort}</div>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="p-3 text-center">{pos.anzahlPlaetze}</td>
                  <td className="p-3 text-sm">{pos.dienst}</td>
                  <td className="p-3 text-sm">
                    {pos.ansprechpartner ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 font-medium text-gray-900 dark:text-white">
                          <User className="w-3.5 h-3.5 text-gray-400" />
                          {pos.ansprechpartner.name}
                          {pos.ansprechpartner.rolle && (
                            <span className="text-xs text-gray-400">
                              ({pos.ansprechpartner.rolle})
                            </span>
                          )}
                        </div>
                        {pos.ansprechpartner.telefon && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Phone className="w-3 h-3" />
                            {pos.ansprechpartner.telefon}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400 flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        Kein AP
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-sm text-gray-600 dark:text-gray-300">
                    {pos.gewuenschterTermin
                      ? new Date(pos.gewuenschterTermin).toLocaleDateString('de-DE')
                      : 'Nach Absprache'}
                  </td>
                  <td className="p-3">
                    {pos.projektId ? (
                      <button
                        onClick={() => handleProjektOeffnen(pos.projektId!)}
                        className="p-1.5 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors"
                        title="Projekt öffnen"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Timestamps */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-gray-500 dark:text-gray-400">Erstellt:</span>
          <span className="ml-2 text-gray-900 dark:text-white">
            {new Date(auftrag.erstelltAm).toLocaleDateString('de-DE')}
          </span>
        </div>
        {auftrag.gesendetAm && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">Gesendet:</span>
            <span className="ml-2 text-gray-900 dark:text-white">
              {new Date(auftrag.gesendetAm).toLocaleDateString('de-DE')}
            </span>
          </div>
        )}
        {auftrag.bestaetigtAm && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">Bestätigt:</span>
            <span className="ml-2 text-gray-900 dark:text-white">
              {new Date(auftrag.bestaetigtAm).toLocaleDateString('de-DE')}
            </span>
          </div>
        )}
        {auftrag.erledigtAm && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">Erledigt:</span>
            <span className="ml-2 text-gray-900 dark:text-white">
              {new Date(auftrag.erledigtAm).toLocaleDateString('de-DE')}
            </span>
          </div>
        )}
      </div>

      {/* Löschen-Button */}
      {auftrag.status === 'erstellt' && (
        <div className="pt-4 border-t border-gray-200 dark:border-dark-border">
          {showDeleteConfirm ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                Auftrag wirklich löschen?
              </span>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                Ja, löschen
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-dark-border transition-colors"
              >
                Abbrechen
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
            >
              <Trash2 className="w-4 h-4" />
              Auftrag löschen
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default InstandsetzungsauftragDetail;
