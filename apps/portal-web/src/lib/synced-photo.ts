// The shared instance, not raw axios: it carries the auth/refresh
// interceptors the rest of the dashboard relies on, and it is what the
// dashboard tests mock.
import axios from "@/lib/axios-interceptor";

/**
 * Fetches the profile photo the Dasma sync pulled from BioStar into
 * PostgreSQL.
 *
 * The gate dashboards read a person's photo from BioStar's user-detail
 * response. On the Dasma deployment nothing ever uploads a photo TO BioStar —
 * the outbound CSV has no photo column and the source view is not queried for
 * one — so whenever BioStar has no photo for someone, the copy the inbound
 * sync stored in PostgreSQL is the only one that exists. This reaches it.
 *
 * Never throws: a missing photo must degrade to the placeholder avatar, never
 * break the live gate feed.
 */
export async function fetchSyncedPhoto(
  idNumber: string,
  token: string | null | undefined,
): Promise<string | undefined> {
  if (!idNumber || !token) return undefined;

  try {
    const response = await axios.get(
      `${process.env.NEXT_PUBLIC_API_URL}/students/${encodeURIComponent(idNumber)}`,
      {
        headers: {
          accept: "*/*",
          Authorization: `${token}`,
        },
      },
    );
    return response.data?.Photo ?? undefined;
  } catch {
    // 404 for an unknown ID is expected and not worth surfacing.
    return undefined;
  }
}
