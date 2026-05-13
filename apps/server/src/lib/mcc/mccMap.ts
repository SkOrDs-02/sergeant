/**
 * Status: Active.
 *
 * Rule-based MCC → AI-Category mapping (ISO 18245 top-100).
 *
 * Background: PR-17 з WF-06 mono optimization. До цього кожна Monobank-tx
 * прокидалася через Claude (haiku-4-5) у `categorizeTransaction` — дорого
 * і повільно. Більшість MCC можна резолвити детерміністично за публічним
 * ISO 18245 списком; AI лишаємо тільки для невідомих кодів (PR-18).
 *
 * Категорії — це AI-enum з `routes/internal/categorize.ts::CATEGORIES`
 * (`groceries | transport | dining | entertainment | utilities | health |
 *   shopping | education | subscriptions | income | transfer | other`),
 * НЕ slug-и категорій з `@sergeant/finyk-domain` (`food`, `restaurant`,
 * …). Це різні поверхні: AI-enum пише у `mono_transaction.ai_category_slug`,
 * domain-slug-и — у `category_slug`. Не змішуйте їх.
 *
 * Покриття: ~100 ISO-18245 MCC-кодів, які реально приходять з українських
 * терміналів за нашою webhook-телеметрією (groceries / fuel / dining /
 * utilities / clothing / pharmacies / digital subscriptions / healthcare /
 * transport / travel / education / charity / cash-advance / financial).
 *
 * Source of truth для MCC↔group: ISO 18245:2003 (Merchant Category Codes),
 * звірено з:
 *   - https://en.wikipedia.org/wiki/Merchant_category_code
 *   - Monobank Open API enum (`mcc-codes`)
 *   - Visa / Mastercard публічні MCC-таблиці
 *
 * Mapping decisions where ISO is ambiguous → fall through:
 *   - "5999 Miscellaneous Specialty Retail" — too broad, leave to AI.
 *   - "6010 Financial Institutions — Manual Cash" — manual cash, not income/transfer.
 *   - "6051 Quasi Cash" — crypto/securities, leave to AI (could be transfer or shopping).
 */

export const MCC_CATEGORIES_AI = [
  "groceries",
  "transport",
  "dining",
  "entertainment",
  "utilities",
  "health",
  "shopping",
  "education",
  "subscriptions",
  "income",
  "transfer",
  "other",
] as const;

export type McCategoryAi = (typeof MCC_CATEGORIES_AI)[number];

/**
 * Plain MCC → category table. `Object.freeze` to flag accidental writes
 * from callers in dev (mutation would throw in strict mode). All entries
 * are bounded by the `MCC_CATEGORIES_AI` enum above — keep them in sync.
 *
 * Numeric keys are 4-digit ISO 18245 codes. Comments group rows by the
 * ISO range so the diff stays human-reviewable when we add more codes.
 */
const MCC_MAP: Readonly<Record<number, McCategoryAi>> = Object.freeze({
  // ── Travel & transport carriers (3xxx — airline-specific codes) ─
  // ISO 18245 reserves 3000–3299 for airline MCCs and 3300–3499 for
  // car-rental. We map the umbrella codes only — individual airlines
  // share the same "travel" category, but most webhooks come through
  // 4511 (airlines, generic) anyway.
  3000: "transport", // Airlines — generic / default carrier
  3001: "transport",
  3005: "transport",
  3007: "transport",
  3008: "transport",
  3009: "transport",
  3010: "transport",

  // ── Transportation (4xxx) ──────────────────────────────────────
  4111: "transport", // Local/suburban commuter passenger transport (metro, electric trains)
  4112: "transport", // Passenger railways
  4119: "health", // Ambulance services — emergency medical
  4121: "transport", // Taxis & limousines (Uber, Bolt, Uklon)
  4131: "transport", // Bus lines
  4214: "transport", // Motor freight carriers & trucking
  4215: "transport", // Courier services (Nova Poshta, DHL, FedEx)
  4225: "transport", // Public warehousing
  4411: "transport", // Cruise & steamship lines
  4457: "transport", // Boat rentals & leases
  4468: "transport", // Marinas, marine service & supplies
  4511: "transport", // Airlines, air carriers (generic)
  4582: "transport", // Airports, flying fields & airport terminals
  4722: "transport", // Travel agencies & tour operators
  4784: "transport", // Tolls & bridge fees
  4789: "transport", // Transportation services — not elsewhere classified
  4812: "utilities", // Telecom equipment (incl. mobile phones)
  4814: "utilities", // Telecommunication services (carriers — Kyivstar, Vodafone, lifecell)
  4816: "utilities", // Computer network/info services (ISPs)
  4821: "utilities", // Telegraph services
  4829: "transfer", // Money orders / wire transfer
  4899: "subscriptions", // Cable, satellite & other pay TV/radio
  4900: "utilities", // Utilities — electric, gas, sanitary, water

  // ── Retail outlets / services (5xxx) ──────────────────────────
  5013: "transport", // Motor vehicle supplies & new parts
  5021: "shopping", // Office & commercial furniture
  5039: "shopping", // Construction materials — not elsewhere classified
  5044: "shopping", // Office, photographic, photocopy & microfilm equipment
  5045: "shopping", // Computers, computer peripheral equipment, software
  5046: "shopping", // Commercial equipment — not elsewhere classified
  5047: "health", // Medical, dental, ophthalmic, hospital equipment
  5065: "shopping", // Electrical parts & equipment
  5072: "shopping", // Hardware equipment & supplies
  5074: "shopping", // Plumbing & heating equipment
  5085: "shopping", // Industrial supplies — not elsewhere classified
  5094: "shopping", // Precious stones, metals, watches & jewelry
  5099: "shopping", // Durable goods — not elsewhere classified
  5111: "shopping", // Stationery, office, school supply & printing
  5122: "health", // Drugs, drug proprietors & druggists sundries
  5131: "shopping", // Piece goods, notions & other dry goods
  5137: "shopping", // Men's, women's & children's uniforms & commercial clothing
  5139: "shopping", // Commercial footwear
  5172: "transport", // Petroleum & petroleum products (fuel wholesalers)
  5192: "shopping", // Books, periodicals & newspapers
  5193: "shopping", // Florists, suppliers & nursery stock & flowers
  5198: "shopping", // Paints, varnishes & supplies
  5199: "shopping", // Non-durable goods — not elsewhere classified
  5200: "shopping", // Home supply warehouse stores
  5211: "shopping", // Lumber & building materials
  5231: "shopping", // Glass, paint & wallpaper stores
  5251: "shopping", // Hardware stores (Epicentr K, Leroy Merlin)
  5261: "shopping", // Nurseries, lawn & garden supply stores
  5271: "shopping", // Mobile home dealers
  5300: "groceries", // Wholesale clubs (Metro Cash & Carry)
  5309: "shopping", // Duty-free stores
  5310: "shopping", // Discount stores
  5311: "shopping", // Department stores
  5331: "shopping", // Variety stores
  5399: "shopping", // Misc. general merchandise stores
  5411: "groceries", // Grocery stores & supermarkets (Сільпо, АТБ, Novus)
  5412: "groceries", // Grocery stores (legacy)
  5422: "groceries", // Freezer & locker meat provisioners
  5441: "groceries", // Candy, nut & confectionery stores
  5451: "groceries", // Dairy products stores
  5462: "groceries", // Bakeries
  5499: "groceries", // Misc. food stores (convenience markets, specialty)
  5511: "transport", // Car & truck dealers — sales, service, repairs, parts, leasing
  5521: "transport", // Auto/truck dealers (used only)
  5531: "transport", // Auto & home supply stores
  5532: "transport", // Automotive tire stores
  5533: "transport", // Automotive parts & accessories stores
  5541: "transport", // Service stations (gas/petrol — WOG, OKKO, Shell)
  5542: "transport", // Automated fuel dispensers
  5551: "transport", // Boat dealers
  5561: "transport", // Recreational & utility trailers, camp dealers
  5571: "transport", // Motorcycle shops & dealers
  5592: "transport", // Motor home dealers
  5598: "transport", // Snowmobile dealers
  5599: "transport", // Misc. automotive, aircraft & farm equipment dealers
  5611: "shopping", // Men's & boys' clothing & accessories stores
  5621: "shopping", // Women's ready-to-wear stores
  5631: "shopping", // Women's accessory & specialty shops
  5641: "shopping", // Children's & infants' wear stores
  5651: "shopping", // Family clothing stores (Zara, H&M, Reserved)
  5655: "shopping", // Sports & riding apparel stores
  5661: "shopping", // Shoe stores
  5681: "shopping", // Furriers & fur shops
  5691: "shopping", // Men's & women's clothing stores
  5697: "shopping", // Tailors, alterations
  5698: "shopping", // Wig & toupee stores
  5699: "shopping", // Misc. apparel & accessory stores
  5712: "shopping", // Furniture, home furnishings & equipment stores
  5713: "shopping", // Floor covering stores
  5714: "shopping", // Drapery, window covering & upholstery stores
  5718: "shopping", // Fireplace, fireplace screens & accessories stores
  5719: "shopping", // Misc. home furnishing specialty stores
  5722: "shopping", // Household appliance stores
  5732: "shopping", // Electronics stores (consumer electronics — Allo, Comfy)
  5733: "shopping", // Music stores — musical instruments, pianos, sheet music
  5734: "subscriptions", // Computer software stores (boxed software — historically AppStore/Google Play also bill via 5735)
  5735: "subscriptions", // Record stores → modern: digital media (Spotify, Apple Music)
  5811: "dining", // Caterers
  5812: "dining", // Eating places & restaurants
  5813: "dining", // Drinking places (bars, lounges, taverns)
  5814: "dining", // Fast food restaurants (McDonald's, KFC, Burger King)
  5815: "subscriptions", // Digital goods — media, books, movies, music (App Store, Google Play, Steam)
  5816: "subscriptions", // Digital goods — games
  5817: "subscriptions", // Digital goods — applications (excluding games)
  5818: "subscriptions", // Digital goods — large digital goods merchant
  5912: "health", // Drug stores & pharmacies
  5921: "groceries", // Package stores — beer, wine & liquor
  5931: "shopping", // Used merchandise & secondhand stores
  5932: "shopping", // Antique shops — sales, repairs & restoration services
  5933: "shopping", // Pawn shops
  5935: "shopping", // Wrecking & salvage yards
  5937: "shopping", // Antique reproductions
  5940: "shopping", // Bicycle shops — sales & service
  5941: "shopping", // Sporting goods stores
  5942: "education", // Book stores
  5943: "shopping", // Stationery stores, office & school supply stores
  5944: "shopping", // Jewelry stores, watches, clocks & silverware
  5945: "shopping", // Hobby, toy & game shops
  5946: "shopping", // Camera & photographic supply stores
  5947: "shopping", // Gift, card, novelty & souvenir shops
  5948: "shopping", // Luggage & leather goods stores
  5949: "shopping", // Sewing, needlework, fabric & piece goods stores
  5950: "shopping", // Glassware & crystal stores
  5960: "subscriptions", // Direct marketing — insurance services (recurring billing)
  5961: "shopping", // Mail order houses
  5962: "shopping", // Direct marketing — travel-related arrangements
  5963: "shopping", // Door-to-door sales
  5964: "shopping", // Direct marketing — catalog merchant
  5965: "shopping", // Direct marketing — catalog & retail merchant
  5966: "shopping", // Direct marketing — outbound telemarketing merchant
  5967: "entertainment", // Direct marketing — inbound telemarketing merchant (often adult/lottery)
  5968: "subscriptions", // Direct marketing — continuity/subscription merchant
  5969: "shopping", // Direct marketing — other direct marketers
  5970: "shopping", // Artists supply & craft shops
  5971: "shopping", // Art dealers & galleries
  5972: "shopping", // Stamp & coin stores
  5973: "shopping", // Religious goods stores
  5975: "health", // Hearing aids — sales, service & supply stores
  5976: "health", // Orthopedic goods — prosthetic devices
  5977: "shopping", // Cosmetic stores
  5978: "shopping", // Typewriter stores — sales, rentals, service
  5983: "transport", // Fuel dealers — fuel oil, wood, coal & liquefied petroleum
  5992: "shopping", // Florists
  5993: "shopping", // Cigar stores & stands
  5994: "shopping", // News dealers & newsstands
  5995: "shopping", // Pet shops, pet food & supplies
  5997: "shopping", // Electric razor stores — sales & service
  5998: "shopping", // Tent & awning shops
  5999: "shopping", // Misc. specialty retail stores

  // ── Financial / business services (6xxx) ───────────────────────
  6011: "transfer", // Financial institutions — automated cash disbursements (ATM withdrawals)
  6012: "transfer", // Financial institutions — merchandise & services (incl. loans, lo-amount transfers)
  6051: "transfer", // Non-fi — foreign currency, money orders, scrips, travelers cheques

  // ── Services (7xxx) ────────────────────────────────────────────
  7011: "transport", // Hotels, motels & resorts
  7012: "transport", // Timeshares
  7032: "transport", // Sporting & recreational camps
  7033: "transport", // Trailer parks & campgrounds
  7210: "shopping", // Laundry, cleaning & garment services
  7211: "shopping", // Laundries — family & commercial
  7216: "shopping", // Dry cleaners
  7217: "shopping", // Carpet & upholstery cleaning
  7221: "shopping", // Photographic studios
  7230: "shopping", // Beauty & barber shops
  7251: "shopping", // Shoe repair shops, shoe shine parlors & hat cleaning shops
  7261: "shopping", // Funeral services & crematories
  7273: "entertainment", // Dating & escort services
  7276: "shopping", // Tax preparation services
  7277: "health", // Counseling services — debt, marriage & personal
  7278: "shopping", // Buying & shopping services & clubs
  7296: "shopping", // Clothing rental — costumes, formal wear, uniforms
  7297: "shopping", // Massage parlors
  7298: "health", // Health & beauty spas
  7299: "shopping", // Misc. personal services — not elsewhere classified
  7311: "shopping", // Advertising services
  7321: "shopping", // Credit reporting agencies
  7333: "shopping", // Commercial photography, art & graphics
  7338: "shopping", // Quick-copy, reproduction & blueprinting services
  7339: "shopping", // Stenographic & secretarial support services
  7342: "shopping", // Exterminating & disinfecting services
  7349: "shopping", // Cleaning, maintenance & janitorial services
  7361: "shopping", // Employment agencies & temporary help services
  7372: "subscriptions", // Computer programming, data processing & integrated systems design (SaaS, dev tools, ChatGPT/Anthropic billing)
  7375: "subscriptions", // Information retrieval services
  7379: "subscriptions", // Computer maintenance & repair services
  7392: "shopping", // Management, consulting & public relations services
  7393: "shopping", // Detective agencies, protective agencies & security services
  7394: "shopping", // Equipment, tool, furniture & appliance rental & leasing
  7395: "shopping", // Photofinishing laboratories & photo developing
  7399: "shopping", // Business services — not elsewhere classified
  7511: "transport", // Truck stop transactions
  7512: "transport", // Car rental agencies
  7513: "transport", // Truck & utility trailer rentals
  7519: "transport", // Motor home & recreational vehicle rentals
  7523: "transport", // Automobile parking lots & garages
  7531: "transport", // Automotive body repair shops
  7534: "transport", // Tire retreading & repair shops
  7535: "transport", // Automotive paint shops
  7538: "transport", // Automotive service shops (non-dealer)
  7542: "transport", // Car washes
  7549: "transport", // Towing services
  7622: "shopping", // Radio, TV & stereo repair shops
  7623: "shopping", // Air conditioning & refrigeration repair shops
  7629: "shopping", // Electrical & small appliance repair shops
  7631: "shopping", // Watch, clock & jewelry repair
  7641: "shopping", // Furniture, furniture repair & furniture refinishing
  7692: "shopping", // Welding services
  7699: "shopping", // Misc. repair shops & related services
  7829: "entertainment", // Motion picture & video tape production & distribution
  7832: "entertainment", // Motion picture theaters (Multiplex, Planeta Kino)
  7841: "entertainment", // Video tape rental stores
  7911: "entertainment", // Dance halls, studios & schools
  7922: "entertainment", // Theatrical producers, ticket agencies (concert tickets)
  7929: "entertainment", // Bands, orchestras & misc. entertainers
  7932: "entertainment", // Billiard & pool establishments
  7933: "entertainment", // Bowling alleys
  7941: "entertainment", // Commercial sports, professional sports clubs, athletic fields
  7991: "entertainment", // Tourist attractions & exhibits
  7992: "entertainment", // Public golf courses
  7993: "entertainment", // Video amusement game supplies
  7994: "entertainment", // Video game arcades
  7995: "entertainment", // Betting (incl. lottery tickets, casino chips, off-track betting)
  7996: "entertainment", // Amusement parks, circuses, carnivals & fortune tellers
  7997: "entertainment", // Membership clubs (sports, recreation, athletic), country clubs
  7998: "entertainment", // Aquariums, dolphinariums, seaquariums & zoos
  7999: "entertainment", // Recreation services — not elsewhere classified

  // ── Professional services / membership / govt (8xxx) ───────────
  8011: "health", // Doctors & physicians — not elsewhere classified
  8021: "health", // Dentists & orthodontists
  8031: "health", // Osteopaths
  8041: "health", // Chiropractors
  8042: "health", // Optometrists & ophthalmologists
  8043: "health", // Opticians, optical goods & eyeglasses
  8049: "health", // Podiatrists & chiropodists
  8050: "health", // Nursing & personal care facilities
  8062: "health", // Hospitals
  8071: "health", // Medical & dental laboratories
  8099: "health", // Health practitioners, medical services — not elsewhere classified
  8111: "shopping", // Legal services & attorneys
  8211: "education", // Elementary & secondary schools
  8220: "education", // Colleges, universities, professional schools & junior colleges
  8241: "education", // Correspondence schools
  8244: "education", // Business & secretarial schools
  8249: "education", // Vocational & trade schools
  8299: "education", // Schools & educational services — not elsewhere classified
  8351: "education", // Child care services
  8398: "transfer", // Charitable & social service organizations (donations to charities — not direct expense)
  8641: "subscriptions", // Civic, social, fraternal associations
  8651: "shopping", // Political organizations
  8661: "transfer", // Religious organizations (tithes/donations)
  8675: "subscriptions", // Automobile associations
  8699: "subscriptions", // Membership organizations — not elsewhere classified
  8734: "health", // Testing laboratories (medical/diagnostic)
  8911: "shopping", // Architectural, engineering & surveying services
  8931: "shopping", // Accounting, auditing & bookkeeping services
  8999: "shopping", // Professional services — not elsewhere classified

  // ── Government / utilities (9xxx) ──────────────────────────────
  9211: "utilities", // Court costs, alimony & child support
  9222: "utilities", // Fines
  9223: "utilities", // Bail & bond payments
  9311: "utilities", // Tax payments
  9399: "utilities", // Government services — not elsewhere classified
  9402: "utilities", // Postal services — government only (Ukrposhta)
  9405: "utilities", // U.S. federal government agencies / departments
});

/**
 * Resolve a Monobank MCC (ISO 18245) to a Sergeant AI-category. Returns
 * `null` for `0`, `null`, `undefined`, or codes outside `MCC_MAP`.
 *
 * Callers (`categorizeTransaction` in particular) MUST treat `null` as a
 * miss and fall through to the AI fallback path, and MUST emit the
 * `mono_mcc_match_total{outcome}` counter so the rule-based hit rate is
 * observable in Grafana.
 */
export function lookupMccCategory(
  mcc: number | null | undefined,
): McCategoryAi | null {
  if (mcc == null || mcc === 0) return null;
  if (!Number.isInteger(mcc)) return null;
  return MCC_MAP[mcc] ?? null;
}

/**
 * Internal — exposed for tests and the migration generator. Do not
 * import from request handlers; use `lookupMccCategory()` instead so
 * the lookup stays a single function call.
 */
export function getMccMap(): Readonly<Record<number, McCategoryAi>> {
  return MCC_MAP;
}
