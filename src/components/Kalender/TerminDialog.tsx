import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, MapPin, Repeat, Bell, Palette } from 'lucide-react';
import { format } from 'date-fns';
import { Termin, NeuerTermin, TerminFormData, TERMIN_FARBEN } from '../../types/termin';

interface TerminDialogProps {
  termin?: Termin | null;
  initialDatum?: Date | null;
  onSave: (terminData: NeuerTermin) => void;
  onCancel: () => void;
}

const TerminDialog: React.FC<TerminDialogProps> = ({
  termin,
  initialDatum,
  onSave,
  onCancel,
}) => {
  const [formData, setFormData] = useState<TerminFormData>({
    titel: '',
    beschreibung: '',
    startDatum: '',
    endDatum: '',
    ganztaegig: false,
    farbe: TERMIN_FARBEN[0],
    ort: '',
    wiederholung: 'keine',
    wiederholungEnde: '',
    erinnerung: 0,
    startTime: '',
    endTime: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Formular initialisieren
  useEffect(() => {
    if (termin) {
      // Bearbeiten
      const startDatum = new Date(termin.startDatum);
      const endDatum = new Date(termin.endDatum);
      
      setFormData({
        titel: termin.titel,
        beschreibung: termin.beschreibung || '',
        startDatum: format(startDatum, 'yyyy-MM-dd'),
        endDatum: format(endDatum, 'yyyy-MM-dd'),
        ganztaegig: termin.ganztaegig,
        farbe: termin.farbe || TERMIN_FARBEN[0],
        ort: termin.ort || '',
        wiederholung: termin.wiederholung || 'keine',
        wiederholungEnde: termin.wiederholungEnde || '',
        erinnerung: termin.erinnerung || 0,
        startTime: termin.ganztaegig ? '' : format(startDatum, 'HH:mm'),
        endTime: termin.ganztaegig ? '' : format(endDatum, 'HH:mm'),
      });
    } else if (initialDatum) {
      // Neuer Termin mit vorgegebenem Datum
      const start = new Date(initialDatum);
      const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 Stunde später
      
      setFormData({
        titel: '',
        beschreibung: '',
        startDatum: format(start, 'yyyy-MM-dd'),
        endDatum: format(end, 'yyyy-MM-dd'),
        ganztaegig: false,
        farbe: TERMIN_FARBEN[0],
        ort: '',
        wiederholung: 'keine',
        wiederholungEnde: '',
        erinnerung: 0,
        startTime: format(start, 'HH:mm'),
        endTime: format(end, 'HH:mm'),
      });
    } else {
      // Neuer Termin ohne Datum
      const jetzt = new Date();
      const start = new Date(jetzt.getTime() + 60 * 60 * 1000); // 1 Stunde später
      const end = new Date(start.getTime() + 60 * 60 * 1000); // 2 Stunden später
      
      setFormData({
        titel: '',
        beschreibung: '',
        startDatum: format(start, 'yyyy-MM-dd'),
        endDatum: format(end, 'yyyy-MM-dd'),
        ganztaegig: false,
        farbe: TERMIN_FARBEN[0],
        ort: '',
        wiederholung: 'keine',
        wiederholungEnde: '',
        erinnerung: 0,
        startTime: format(start, 'HH:mm'),
        endTime: format(end, 'HH:mm'),
      });
    }
  }, [termin, initialDatum]);

  // Formular validieren
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.titel.trim()) {
      newErrors.titel = 'Titel ist erforderlich';
    }

    if (!formData.startDatum) {
      newErrors.startDatum = 'Startdatum ist erforderlich';
    }

    if (!formData.endDatum) {
      newErrors.endDatum = 'Enddatum ist erforderlich';
    }

    if (!formData.ganztaegig) {
      if (!formData.startTime) {
        newErrors.startTime = 'Startzeit ist erforderlich';
      }
      if (!formData.endTime) {
        newErrors.endTime = 'Endzeit ist erforderlich';
      }

      // Prüfe ob Endzeit nach Startzeit liegt
      if (formData.startTime && formData.endTime) {
        const startDateTime = new Date(`${formData.startDatum}T${formData.startTime}`);
        const endDateTime = new Date(`${formData.endDatum}T${formData.endTime}`);
        
        if (endDateTime <= startDateTime) {
          newErrors.endTime = 'Endzeit muss nach der Startzeit liegen';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Formular speichern
  const handleSave = () => {
    if (!validateForm()) return;

    let startDateTime: Date;
    let endDateTime: Date;

    if (formData.ganztaegig) {
      startDateTime = new Date(`${formData.startDatum}T00:00:00`);
      endDateTime = new Date(`${formData.endDatum}T23:59:59`);
    } else {
      startDateTime = new Date(`${formData.startDatum}T${formData.startTime}`);
      endDateTime = new Date(`${formData.endDatum}T${formData.endTime}`);
    }

    const terminData: NeuerTermin = {
      titel: formData.titel.trim(),
      beschreibung: formData.beschreibung?.trim() || '',
      startDatum: startDateTime.toISOString(),
      endDatum: endDateTime.toISOString(),
      ganztaegig: formData.ganztaegig,
      farbe: formData.farbe,
      ort: formData.ort?.trim() || '',
      wiederholung: formData.wiederholung,
      wiederholungEnde: formData.wiederholungEnde || '',
      erinnerung: formData.erinnerung,
    };

    onSave(terminData);
  };

  // Input Handler
  const handleInputChange = (field: keyof TerminFormData, value: string | boolean | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Error für dieses Feld löschen
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // Ganztägig Toggle
  const handleGanztaegigChange = (ganztaegig: boolean) => {
    handleInputChange('ganztaegig', ganztaegig);
    
    if (ganztaegig) {
      // Bei ganztägig: Zeiten löschen
      handleInputChange('startTime', '');
      handleInputChange('endTime', '');
    } else {
      // Bei nicht ganztägig: Standard-Zeiten setzen
      const jetzt = new Date();
      const start = new Date(jetzt.getTime() + 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      
      handleInputChange('startTime', format(start, 'HH:mm'));
      handleInputChange('endTime', format(end, 'HH:mm'));
    }
  };

  const istBearbeitung = !!termin;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-surface rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">
            {istBearbeitung ? 'Termin bearbeiten' : 'Neuer Termin'}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-dark-textMuted transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-6">
          {/* Titel */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              Titel *
            </label>
            <input
              type="text"
              value={formData.titel}
              onChange={(e) => handleInputChange('titel', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 ${
                errors.titel ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Termin-Titel eingeben..."
              autoFocus
            />
            {errors.titel && (
              <p className="mt-1 text-sm text-red-600">{errors.titel}</p>
            )}
          </div>

          {/* Datum und Zeit */}
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <Calendar className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.ganztaegig}
                  onChange={(e) => handleGanztaegigChange(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-dark-textMuted">Ganztägig</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                  Startdatum *
                </label>
                <input
                  type="date"
                  value={formData.startDatum}
                  onChange={(e) => handleInputChange('startDatum', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 ${
                    errors.startDatum ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.startDatum && (
                  <p className="mt-1 text-sm text-red-600">{errors.startDatum}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                  Enddatum *
                </label>
                <input
                  type="date"
                  value={formData.endDatum}
                  onChange={(e) => handleInputChange('endDatum', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 ${
                    errors.endDatum ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.endDatum && (
                  <p className="mt-1 text-sm text-red-600">{errors.endDatum}</p>
                )}
              </div>
            </div>

            {!formData.ganztaegig && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                    <Clock className="h-4 w-4 inline mr-1" />
                    Startzeit *
                  </label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => handleInputChange('startTime', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 ${
                      errors.startTime ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.startTime && (
                    <p className="mt-1 text-sm text-red-600">{errors.startTime}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-1">
                    Endzeit *
                  </label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => handleInputChange('endTime', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 ${
                      errors.endTime ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.endTime && (
                    <p className="mt-1 text-sm text-red-600">{errors.endTime}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Beschreibung */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              Beschreibung
            </label>
            <textarea
              value={formData.beschreibung}
              onChange={(e) => handleInputChange('beschreibung', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="Optionale Beschreibung..."
            />
          </div>

          {/* Ort */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              <MapPin className="h-4 w-4 inline mr-1" />
              Ort
            </label>
            <input
              type="text"
              value={formData.ort}
              onChange={(e) => handleInputChange('ort', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="z.B. Besprechungsraum 1"
            />
          </div>

          {/* Farbe */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              <Palette className="h-4 w-4 inline mr-1" />
              Farbe
            </label>
            <div className="flex space-x-2">
              {TERMIN_FARBEN.map((farbe) => (
                <button
                  key={farbe}
                  type="button"
                  onClick={() => handleInputChange('farbe', farbe)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    formData.farbe === farbe
                      ? 'border-gray-800 scale-110'
                      : 'border-gray-300 hover:scale-105'
                  }`}
                  style={{ backgroundColor: farbe }}
                />
              ))}
            </div>
          </div>

          {/* Wiederholung */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              <Repeat className="h-4 w-4 inline mr-1" />
              Wiederholung
            </label>
            <select
              value={formData.wiederholung}
              onChange={(e) => handleInputChange('wiederholung', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="keine">Keine Wiederholung</option>
              <option value="taeglich">Täglich</option>
              <option value="woechentlich">Wöchentlich</option>
              <option value="monatlich">Monatlich</option>
              <option value="jaehrlich">Jährlich</option>
            </select>
          </div>

          {/* Erinnerung */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              <Bell className="h-4 w-4 inline mr-1" />
              Erinnerung
            </label>
            <select
              value={formData.erinnerung}
              onChange={(e) => handleInputChange('erinnerung', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={0}>Keine Erinnerung</option>
              <option value={5}>5 Minuten vorher</option>
              <option value={10}>10 Minuten vorher</option>
              <option value={15}>15 Minuten vorher</option>
              <option value={30}>30 Minuten vorher</option>
              <option value={60}>1 Stunde vorher</option>
              <option value={120}>2 Stunden vorher</option>
              <option value={1440}>1 Tag vorher</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 dark:border-dark-border">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 dark:text-dark-textMuted bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-md transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
          >
            {istBearbeitung ? 'Aktualisieren' : 'Erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TerminDialog;