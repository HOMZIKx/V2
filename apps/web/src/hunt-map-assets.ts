/** Shared PH map atlas assets for Timers + Party (separate domains, same images). */

export const huntMapFiles: Readonly<Record<string, string>> = {
  M2: 'map_m2.png',
  M3: 'map_m3.png',
  'Dolina Orków': 'map_orki.png',
  'Pustynia Yongbi': 'map_pustynia.png',
  'Świątynia Hwang': 'map_swiatynia.png',
  'Góra Sohan': 'map_sohan.png',
  'Ognista Ziemia': 'map_ognista.png',
  'Las Duchów': 'map_lasduchow.png',
  'Kraina Gigantów': 'map_giganty.png',
  'Czerwony Las': 'map_czerwonylas.png',
  'Wężowe Pole': 'map_wezowe.png',
  'Atlantyda V1': 'map_atlantyda_v1_new.png',
  'Atlantyda V2': 'map_atlantyda_v2_new.png',
};

export function huntMapImagePath(mapKey: string): string | null {
  const file = huntMapFiles[mapKey];
  return file ? `/game/maps/${file}` : null;
}
