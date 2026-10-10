import { createTheme, type MantineColorsTuple } from "@mantine/core";

const seal: MantineColorsTuple = [
  "#fbf6f3",
  "#f3e6e1",
  "#e6cdc4",
  "#d4a99a",
  "#c17d6a",
  "#a85a48",
  "#9c3b2e",
  "#7f2f25",
  "#64261e",
  "#3e1712",
];

const moss: MantineColorsTuple = [
  "#f3f6f1",
  "#e3eadc",
  "#c5d4b6",
  "#a3bb8c",
  "#7d9a62",
  "#5c7a45",
  "#3f5c32",
  "#314826",
  "#24361c",
  "#16210f",
];

const ochre: MantineColorsTuple = [
  "#fbf6ea",
  "#f3e8cc",
  "#e6d09a",
  "#d4b56a",
  "#c09a42",
  "#a07c28",
  "#7d611c",
  "#624c16",
  "#483810",
  "#2c2209",
];

const ash: MantineColorsTuple = [
  "#f6f4f0",
  "#e8e4dc",
  "#d4cec3",
  "#b7b0a3",
  "#978f82",
  "#756e63",
  "#5c564c",
  "#47433b",
  "#332f2a",
  "#1f1c18",
];

export const theme = createTheme({
  primaryColor: "seal",
  primaryShade: 6,
  black: "#1c1915",
  white: "#faf7f2",
  fontFamily: '"Zen Kaku Gothic New", "Hiragino Sans", sans-serif',
  headings: {
    fontFamily: '"Shippori Mincho", "Hiragino Mincho ProN", serif',
    fontWeight: "500",
  },
  defaultRadius: 2,
  colors: { seal, moss, ochre, ash },
  components: {
    Button: {
      defaultProps: { variant: "default" },
    },
  },
});
