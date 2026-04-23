/** GoCardless Banking Types */

export interface BankingStatus {
  configured: boolean;
  institutionId?: string;
  hasRuntimeConfig?: boolean;
}

export interface SetupResponse {
  success: boolean;
  message: string;
}

export interface BankInstitution {
  id: string;
  name: string;
  bic: string;
  logo: string;
  countries: string[];
}

export interface Requisition {
  id: string;
  status: 'CR' | 'LN' | 'RJ' | 'ER' | 'SU' | 'EX' | 'GC' | 'UA' | 'GA' | 'SA';
  accounts: string[];
  link: string;
  institution_id: string;
  created: string;
}

export interface ConnectResponse {
  requisitionId: string;
  link: string;
  agreementId: string;
}

export interface BankBalance {
  balanceAmount: {
    amount: string;
    currency: string;
  };
  balanceType: 'closingBooked' | 'expected' | 'interimAvailable' | 'interimBooked';
  referenceDate?: string;
}

export interface BankTransaction {
  transactionId?: string;
  internalTransactionId?: string;
  bookingDate: string;
  valueDate?: string;
  transactionAmount: {
    amount: string;
    currency: string;
  };
  creditorName?: string;
  creditorAccount?: { iban?: string };
  debtorName?: string;
  debtorAccount?: { iban?: string };
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  additionalInformation?: string;
  bankTransactionCode?: string;
}

export interface AccountSummary {
  kontostand: BankBalance[];
  transaktionen: BankTransaction[];
  zeitraum: {
    von: string;
    bis: string;
  };
  zusammenfassung: {
    eingaenge: number;
    ausgaben: number;
    saldo: number;
    anzahlTransaktionen: number;
  };
  konto: {
    iban?: string;
    name?: string;
    ownerName?: string;
    status?: string;
  };
}

export type RequisitionStatus =
  | 'CR'  // Created
  | 'LN'  // Linked (erfolgreich verbunden)
  | 'RJ'  // Rejected
  | 'ER'  // Error
  | 'SU'  // Suspended
  | 'EX'  // Expired
  | 'GC'  // Granting consent
  | 'UA'  // User authentication
  | 'GA'  // Giving access
  | 'SA'; // Selecting accounts
