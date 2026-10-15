import { useLanguage } from "../context/LanguageContext";
import { growthLocale } from "../lib/growth";
import { formatCount } from "../lib/opportunity";
import type { ListingSamplesResponse } from "../lib/types";
import { formatListingPrice } from "../lib/useEtsyListings";
import { EtsyAttribution } from "./EtsyAttribution";

const MS_PER_HOUR = 3_600_000;

interface EtsyListingsProps {
  data: ListingSamplesResponse | null;
}

/** "On Etsy now": up to five current listings exactly as Etsy returned them, each linking to Etsy. */
export function EtsyListings({ data }: EtsyListingsProps) {
  const { t, language } = useLanguage();
  const locale = growthLocale(language);

  let body;
  if (data === null || data.listings === null) {
    body = (
      <p className="text-sm text-text-muted">
        {data?.status === "unavailable" ? t.etsy.listingsUnavailable : t.etsy.listingsLoading}
      </p>
    );
  } else if (data.listings.length === 0) {
    body = <p className="text-sm text-text-muted">{t.etsy.listingsEmpty}</p>;
  } else {
    body = (
      <ul className="space-y-2">
        {data.listings.map((listing) => (
          <li key={listing.listingId}>
            <a
              href={listing.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t.etsy.openOnEtsy(listing.title)}
              className="flex gap-3 rounded border border-border p-2 hover:border-primary-line"
            >
              {listing.thumbnailUrl ? (
                <img src={listing.thumbnailUrl} alt="" loading="lazy" width={68} height={54} className="h-[54px] w-[68px] shrink-0 rounded object-cover" />
              ) : (
                <div className="h-[54px] w-[68px] shrink-0 rounded bg-bg" aria-hidden />
              )}
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm text-text">{listing.title}</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {formatListingPrice(listing.price, listing.currency, locale)}
                  {" · "}
                  {t.etsy.favorites(formatCount(listing.favorites, locale))}
                  {" · "}
                  {t.etsy.views(formatCount(listing.views, locale))}
                </p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    );
  }

  const hours = data?.fetchedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(data.fetchedAt)) / MS_PER_HOUR)) : null;
  return (
    <div className="flex flex-col gap-3">
      {body}
      <div className="space-y-1">
        {hours !== null && <p className="text-xs text-text-muted">{t.etsy.listingsUpdated(hours)}</p>}
        <EtsyAttribution />
      </div>
    </div>
  );
}
