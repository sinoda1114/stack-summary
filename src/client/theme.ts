import {
  createTheme,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from "@mantine/core";

const moss: MantineColorsTuple = [
  "#f1faf5",
  "#d8f3e4",
  "#b4e6cc",
  "#86d4ad",
  "#4fba86",
  "#22a066",
  "#0e7a45",
  "#0c6840",
  "#0b5a32",
  "#0b5a32",
];

const ochre: MantineColorsTuple = [
  "#fff8ea",
  "#fff1d6",
  "#ffe3ad",
  "#f5ce78",
  "#e0ae45",
  "#c48a1a",
  "#8a5200",
  "#7a4900",
  "#6a3d00",
  "#6a3d00",
];

const ash: MantineColorsTuple = [
  "#f7f8f9",
  "#eef0f3",
  "#dde1e6",
  "#c5ccd3",
  "#9aa3ad",
  "#6b7580",
  "#3e4650",
  "#343c45",
  "#2c333a",
  "#2c333a",
];

const accent: MantineColorsTuple = [
  "#e8f1ff",
  "#d3e4ff",
  "#a8c9fb",
  "#74a6f5",
  "#3d82ee",
  "#1565e0",
  "#0b57d0",
  "#0847ab",
  "#063888",
  "#042864",
];

const fontFamily = '"IBM Plex Sans JP", "Hiragino Sans", sans-serif';

const field = {
  input: {
    backgroundColor: "var(--mantine-color-white)",
    borderColor: "var(--mantine-color-default-border)",
  },
  label: {
    fontWeight: 500,
    marginBottom: 6,
    color: "var(--stack-dimmed)",
  },
};

export const theme = createTheme({
  primaryColor: "accent",
  primaryShade: 6,
  black: "#14181f",
  white: "#ffffff",
  fontFamily,
  headings: {
    fontFamily,
    fontWeight: "600",
    sizes: {
      h1: { fontSize: "1.65rem", lineHeight: "1.3", fontWeight: "600" },
      h2: { fontSize: "1.05rem", lineHeight: "1.4", fontWeight: "600" },
    },
  },
  defaultRadius: 16,
  colors: { accent, moss, ochre, ash },
  components: {
    Button: {
      defaultProps: { variant: "default", fw: 500, radius: 999 },
    },
    ActionIcon: {
      defaultProps: { radius: 999 },
    },
    CloseButton: {
      defaultProps: { radius: 999 },
    },
    Badge: {
      defaultProps: { tt: "none", radius: 999, fw: 500 },
      styles: {
        root: {
          textTransform: "none",
          height: "auto",
          padding: "4px 10px",
          lineHeight: 1.5,
          cursor: "pointer",
        },
      },
    },
    Title: {
      styles: { root: { margin: 0 } },
    },
    TextInput: {
      defaultProps: { radius: 999 },
      styles: field,
    },
    Textarea: {
      styles: field,
    },
    Select: {
      defaultProps: { radius: 999 },
      styles: field,
    },
    Table: {
      defaultProps: {
        withTableBorder: true,
        verticalSpacing: "sm",
        horizontalSpacing: "md",
      },
      styles: {
        table: { backgroundColor: "var(--mantine-color-white)" },
        th: {
          fontWeight: 500,
          color: "var(--stack-dimmed)",
          fontSize: "12px",
        },
        td: { borderColor: "var(--mantine-color-default-border)" },
      },
    },
    Tabs: {
      defaultProps: { radius: 999 },
      styles: {
        list: { marginBottom: 4 },
        tab: { fontWeight: 500 },
        panel: { paddingTop: 22 },
      },
    },
    Accordion: {
      styles: {
        item: {
          backgroundColor: "var(--mantine-color-white)",
          borderColor: "var(--mantine-color-default-border)",
        },
        control: { padding: "14px 16px" },
      },
    },
    Kbd: {
      styles: {
        root: {
          backgroundColor: "var(--mantine-color-white)",
          borderColor: "var(--mantine-color-default-border)",
          color: "var(--mantine-color-text)",
          borderRadius: 8,
        },
      },
    },
  },
});

export const cssVariablesResolver: CSSVariablesResolver = (theme) => ({
  variables: {
    "--mantine-font-family": theme.fontFamily,
    "--mantine-font-family-headings": theme.headings.fontFamily,
    "--stack-dimmed": "#5d6672",
    "--stack-nav": "#2c3340",
    "--stack-chip": "#f4f6f9",
  },
  light: {
    "--mantine-color-body": "#ffffff",
    "--mantine-color-text": theme.black,
    "--mantine-color-default-border": "#e2e6ed",
  },
  dark: {},
});
