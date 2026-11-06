// Центры провинций Испании (приблизительно) и нормализация названий из BOE
window.PROVINCES = {
  "A CORUÑA": [43.18, -8.41], "ÁLAVA": [42.85, -2.67], "ALBACETE": [38.99, -1.86],
  "ALICANTE": [38.48, -0.57], "ALMERÍA": [37.17, -2.34], "ASTURIAS": [43.36, -5.85],
  "ÁVILA": [40.65, -4.70], "BADAJOZ": [38.70, -6.30], "ILLES BALEARS": [39.57, 2.95],
  "BARCELONA": [41.60, 2.05], "BIZKAIA": [43.23, -2.85], "BURGOS": [42.34, -3.70],
  "CÁCERES": [39.70, -6.15], "CÁDIZ": [36.55, -5.75], "CANTABRIA": [43.20, -4.03],
  "CASTELLÓN": [40.15, -0.15], "CEUTA": [35.89, -5.32], "CIUDAD REAL": [38.98, -3.93],
  "CÓRDOBA": [37.88, -4.78], "CUENCA": [40.07, -2.13], "GIPUZKOA": [43.15, -2.20],
  "GIRONA": [42.10, 2.80], "GRANADA": [37.30, -3.30], "GUADALAJARA": [40.80, -2.60],
  "HUELVA": [37.55, -6.90], "HUESCA": [42.20, -0.10], "JAÉN": [37.95, -3.50],
  "LA RIOJA": [42.30, -2.50], "LAS PALMAS": [28.30, -15.40], "LEÓN": [42.60, -5.57],
  "LLEIDA": [41.90, 1.00], "LUGO": [43.00, -7.55], "MADRID": [40.45, -3.70],
  "MÁLAGA": [36.80, -4.60], "MELILLA": [35.29, -2.94], "MURCIA": [38.00, -1.40],
  "NAVARRA": [42.70, -1.65], "OURENSE": [42.20, -7.60], "PALENCIA": [42.30, -4.50],
  "PONTEVEDRA": [42.40, -8.60], "SALAMANCA": [40.85, -6.05],
  "SANTA CRUZ DE TENERIFE": [28.30, -16.80], "SEGOVIA": [41.10, -4.00],
  "SEVILLA": [37.40, -5.75], "SORIA": [41.65, -2.50], "TARRAGONA": [41.10, 0.90],
  "TERUEL": [40.60, -0.90], "TOLEDO": [39.80, -4.20], "VALENCIA": [39.40, -0.65],
  "VALLADOLID": [41.65, -4.73], "ZAMORA": [41.75, -6.00], "ZARAGOZA": [41.60, -1.00]
};

(function () {
  const strip = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
  const byKey = {};
  Object.keys(window.PROVINCES).forEach((p) => (byKey[strip(p)] = p));
  const alias = {
    "ALACANT": "ALICANTE", "ARABA": "ÁLAVA", "BALEARES": "ILLES BALEARS", "ISLAS BALEARES": "ILLES BALEARS",
    "BALEARS": "ILLES BALEARS", "CORUNA": "A CORUÑA", "LA CORUNA": "A CORUÑA", "CORUNA, A": "A CORUÑA",
    "GERONA": "GIRONA", "LERIDA": "LLEIDA", "ORENSE": "OURENSE", "GUIPUZCOA": "GIPUZKOA",
    "VIZCAYA": "BIZKAIA", "CASTELLO": "CASTELLÓN", "CASTELLON DE LA PLANA": "CASTELLÓN",
    "RIOJA": "LA RIOJA", "RIOJA, LA": "LA RIOJA", "TENERIFE": "SANTA CRUZ DE TENERIFE",
    "PALMAS, LAS": "LAS PALMAS", "PALMAS (LAS)": "LAS PALMAS", "ASTURIAS, PRINCIPADO DE": "ASTURIAS",
    "MADRID, COMUNIDAD DE": "MADRID", "MURCIA, REGION DE": "MURCIA", "NAVARRA, COMUNIDAD FORAL DE": "NAVARRA",
    "BALEARS, ILLES": "ILLES BALEARS", "VALENCIA/VALENCIA": "VALENCIA"
  };
  window.normProvince = function (name) {
    let s = strip(name);
    if (!s) return "";
    if (byKey[s]) return byKey[s];
    if (alias[s]) return alias[s];
    const first = s.split("/")[0].trim();
    if (byKey[first]) return byKey[first];
    if (alias[first]) return alias[first];
    const second = (s.split("/")[1] || "").trim();
    if (byKey[second]) return byKey[second];
    return name.toUpperCase();
  };
})();
