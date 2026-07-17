export type PassageDisplay = {
  name: string;
  kind: "bridge" | "tunnel" | "toll_section";
  routeCode?: string;
};

// Customer-facing names for every passage id currently supported by the EGP
// checkout/worker. Aliases remain because old orders retain their original id.
const PASSAGES: Record<string, PassageDisplay> = {
  "at-a9-bosruck": { name: "Bosrucktunnel (A9)", kind: "tunnel" },
  "at-a9-gleinalm": { name: "Gleinalmtunnel (A9)", kind: "tunnel" },
  "at-a10-tauern": { name: "Tauerntunnel a Katschbergtunnel (A10)", kind: "tunnel" },
  "at-a11-karawanken": { name: "Karawankentunnel (A11)", kind: "tunnel" },
  "at-a11-karawanken-south": { name: "Karawankentunnel (A11) · směr Slovinsko", kind: "tunnel" },
  "at-a13-brenner": { name: "Brennerská dálnice (A13)", kind: "toll_section" },
  "at-s16-arlberg": { name: "Arlberg-Straßentunnel (S16)", kind: "tunnel" },
  "ro-fetesti-cernavoda": { name: "Mosty Fetești–Cernavodă (A2)", kind: "bridge", routeCode: "RO" },
  "ro-fetesti-peaj": { name: "Mosty Fetești–Cernavodă (A2)", kind: "bridge", routeCode: "RO" },
  "ro-giurgiu-ruse": { name: "Dunajský most Giurgiu–Ruse", kind: "bridge", routeCode: "RO - BG" },
  "ro-ruse-giurgiu-to-bg": { name: "Dunajský most Giurgiu–Ruse", kind: "bridge", routeCode: "RO - BG" },
  "bg-ruse-giurgiu": { name: "Dunajský most Ruse–Giurgiu", kind: "bridge", routeCode: "BG - RO" },
  "bg-ruse-giurgiu-to-ro": { name: "Dunajský most Ruse–Giurgiu", kind: "bridge", routeCode: "BG - RO" },
  "ro-calafat-vidin": { name: "Dunajský most Calafat–Vidin", kind: "bridge", routeCode: "RO - BG" },
  "ro-vidin-calafat-to-bg": { name: "Dunajský most Calafat–Vidin", kind: "bridge", routeCode: "RO - BG" },
  "bg-vidin-calafat": { name: "Dunajský most Vidin–Calafat", kind: "bridge", routeCode: "BG - RO" },
  "bg-vidin-calafat-to-ro": { name: "Dunajský most Vidin–Calafat", kind: "bridge", routeCode: "BG - RO" },
};

function readableFallback(id: string) {
  return id.replace(/^(at|ro|bg)-/, "").replace(/-to-(at|ro|bg)$/, "").split("-")
    .filter(Boolean)
    .map(part => /^a\d+$|^s\d+$/.test(part) ? part.toUpperCase() : `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function passageDisplay(tollId?: string): PassageDisplay {
  if (!tollId) return { name: "Most nebo placený úsek", kind: "toll_section" };
  return PASSAGES[tollId.trim().toLowerCase()] ?? { name: readableFallback(tollId), kind: "toll_section" };
}
