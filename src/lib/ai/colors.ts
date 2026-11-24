// Library colours: validated categorical order (light / dark steps of the same hues).
export const LIB_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const LIB_COLORS_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c", "#9085e9", "#e66767"];
export const libColor = (i: number, dark = false) => (dark ? LIB_COLORS_DARK : LIB_COLORS)[i % LIB_COLORS.length];
