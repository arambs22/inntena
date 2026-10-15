import "dotenv/config";
import { ETSY_COUNTRY_NAMES } from "../config/etsyCountries.js";
import { fetchListingCountFromEtsy } from "../services/etsyHttp.js";

/**
 * One-off live check of `ETSY_COUNTRY_NAMES`: every name must return a count above 0 for the broad term "clipart".
 * A name returning 0 is not recognised by Etsy and must be removed from the map. Needs ETSY_API_KEY/ETSY_API_SECRET;
 * makes one request per country, spaced 300 ms apart. Not part of CI.
 */
async function main() {
  const failures: string[] = [];
  for (const [code, name] of Object.entries(ETSY_COUNTRY_NAMES)) {
    const { count } = await fetchListingCountFromEtsy("clipart", fetch, { shopLocation: name });
    console.log(`${code}\t${name}\t${count}`);
    if (count === 0) failures.push(`${code} (${name})`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (failures.length > 0) {
    console.error(`Not recognised by Etsy: ${failures.join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
