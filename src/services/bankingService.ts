/**
 * Banking Service - GoCardless Bank Account Data Integration
 *
 * Kommuniziert mit dem Backend unter /api/banking/*
 */

import { backendFetch } from '../config/backend';
import type {
  BankingStatus,
  BankInstitution,
  ConnectResponse,
  Requisition,
  AccountSummary,
  SetupResponse,
} from '../types/banking';

class BankingService {

  /** Prüft ob GoCardless im Backend konfiguriert ist */
  async getStatus(): Promise<BankingStatus> {
    return backendFetch<BankingStatus>('/api/banking/status');
  }

  /** GoCardless Credentials über Portal konfigurieren */
  async setup(secretId: string, secretKey: string, institutionId?: string): Promise<SetupResponse> {
    return backendFetch<SetupResponse>('/api/banking/setup', {
      method: 'POST',
      body: JSON.stringify({ secretId, secretKey, institutionId }),
    });
  }

  /** Konfiguration zurücksetzen */
  async resetSetup(): Promise<void> {
    await backendFetch('/api/banking/setup', { method: 'DELETE' });
  }

  /** Deutsche Banken auflisten */
  async getInstitutions(country = 'DE'): Promise<BankInstitution[]> {
    return backendFetch<BankInstitution[]>(`/api/banking/institutions?country=${country}`);
  }

  /** Bankverbindung erstellen - gibt Link zurück zur Bank-Authentifizierung */
  async connect(redirectUrl: string, institutionId?: string): Promise<ConnectResponse> {
    return backendFetch<ConnectResponse>('/api/banking/connect', {
      method: 'POST',
      body: JSON.stringify({ redirectUrl, institutionId }),
    });
  }

  /** Alle Requisitions (Bankverbindungen) laden */
  async getRequisitions(): Promise<{ results: Requisition[] }> {
    return backendFetch<{ results: Requisition[] }>('/api/banking/requisitions');
  }

  /** Einzelne Requisition prüfen */
  async getRequisition(id: string): Promise<Requisition> {
    return backendFetch<Requisition>(`/api/banking/requisitions/${id}`);
  }

  /** Konto-Zusammenfassung: Kontostand + letzte 30 Tage Transaktionen */
  async getAccountSummary(accountId: string): Promise<AccountSummary> {
    return backendFetch<AccountSummary>(`/api/banking/accounts/${accountId}/summary`);
  }

  /** Transaktionen für einen Zeitraum */
  async getTransactions(accountId: string, dateFrom?: string, dateTo?: string): Promise<any> {
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return backendFetch(`/api/banking/accounts/${accountId}/transactions${qs}`);
  }

  /** Bankverbindung trennen */
  async disconnect(requisitionId: string): Promise<void> {
    await backendFetch(`/api/banking/requisitions/${requisitionId}`, {
      method: 'DELETE',
    });
  }
}

export const bankingService = new BankingService();
