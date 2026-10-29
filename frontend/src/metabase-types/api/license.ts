/** `GET /api/license`. */
export interface LicenseStatus {
  "valid?": boolean;
  plan: string | null;
  expires_at: string | null;
}

export interface UpdateLicenseRequest {
  license_token: string;
}
