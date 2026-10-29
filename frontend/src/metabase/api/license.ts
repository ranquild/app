import type { LicenseStatus, UpdateLicenseRequest } from "metabase-types/api";

import { Api } from "./api";

export const licenseApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getLicense: builder.query<LicenseStatus, void>({
      query: () => "/license",
      providesTags: ["license"],
    }),
    updateLicense: builder.mutation<LicenseStatus, UpdateLicenseRequest>({
      query: (body) => ({ method: "PUT", url: "/license", body }),
      invalidatesTags: ["license"],
    }),
  }),
});

export const { useGetLicenseQuery, useUpdateLicenseMutation } = licenseApi;
