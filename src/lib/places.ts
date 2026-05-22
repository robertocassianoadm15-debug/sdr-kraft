/**
 * Google Places API (New) — Text Search
 * https://developers.google.com/maps/documentation/places/web-service/text-search
 *
 * $200/mês de crédito grátis. ~5000 buscas Text Search/mês free.
 */

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';

export interface PlaceResult {
  google_place_id: string;
  company_name: string;
  phone: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  raw: Record<string, unknown>;
}

export async function searchPlaces(
  query: string,
  maxResults = 20
): Promise<PlaceResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY ausente');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,' +
        'places.internationalPhoneNumber,places.websiteUri,places.types,' +
        'places.addressComponents'
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: 'pt-BR',
      regionCode: 'BR',
      pageSize: Math.min(maxResults, 20)
    })
  });

  if (!res.ok) {
    throw new Error(`Places API err ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  const places = (json.places ?? []) as Array<Record<string, any>>;

  return places.map(p => {
    const components = (p.addressComponents ?? []) as Array<{
      longText: string;
      types: string[];
    }>;
    const city =
      components.find(c => c.types.includes('administrative_area_level_2'))?.longText ??
      components.find(c => c.types.includes('locality'))?.longText ??
      null;
    const state =
      components.find(c => c.types.includes('administrative_area_level_1'))?.longText ??
      null;

    return {
      google_place_id: p.id,
      company_name: p.displayName?.text ?? 'Sem nome',
      phone: p.internationalPhoneNumber ?? null,
      website: p.websiteUri ?? null,
      city,
      state,
      raw: p
    };
  });
}
