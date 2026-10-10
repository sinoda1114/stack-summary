import {
  createTheme,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from "@mantine/core";

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

const label = {
  fontWeight: 500,
  marginBottom: 6,
  color: "#5d6672",
};

export const theme = createTheme({
  primaryColor: "accent",
  primaryShade: 6,
  black: "#14181f",
  white: "#ffffff",
  fontFamily: '"IBM Plex Sans JP", "Hiragino Sans", sans-serif',
  headings: {
    fontFamily: '"IBM Plex Sans JP", "Hiragino Sans", sans-serif',
    fontWeight: "600",
    sizes: {
      h1: { fontSize: "1.65rem", lineHeight: "1.3", fontWeight: "600" },
      h2: { fontSize: "1.05rem", lineHeight: "1.4", fontWeight: "600" },
    },
  },
  defaultRadius: 16,
  colors: { accent },
  components: {
    Button: {
      defaultProps: { variant: "default", fw: 500, radius: 999 },
      styles: { root: { borderRadius: 999 } },
    },
    ActionIcon: {
      defaultProps: { radius: 999 },
      styles: { root: { borderRadius: 999 } },
    },
    CloseButton: {
      defaultProps: { radius: 999 },
      styles: { root: { borderRadius: 999 } },
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
          borderRadius: 999,
        },
      },
    },
    Title: {
      styles: { root: { margin: 0 } },
    },
    TextInput: {
      defaultProps: { radius: 999 },
      styles: {
        input: {
          backgroundColor: "#ffffff",
          borderColor: "var(--mantine-color-default-border)",
          borderRadius: 999,
        },
        label,
      },
    },
    Textarea: {
      defaultProps: { radius: 16 },
      styles: {
        input: {
          backgroundColor: "#ffffff",
          borderColor: "var(--mantine-color-default-border)",
          borderRadius: 16,
        },
        label,
      },
    },
    Select: {
      defaultProps: { radius: 999 },
      styles: {
        input: {
          backgroundColor: "#ffffff",
          borderColor: "var(--mantine-color-default-border)",
          borderRadius: 999,
        },
        label,
      },
    },
    Paper: {
      defaultProps: { radius: 16 },
      styles: { root: { borderRadius: 16 } },
    },
    Table: {
      defaultProps: {
        withTableBorder: true,
        verticalSpacing: "sm",
        horizontalSpacing: "md",
      },
      styles: {
        table: {
          backgroundColor: "#ffffff",
          borderRadius: 16,
          borderCollapse: "separate",
          borderSpacing: 0,
          overflow: "hidden",
        },
        th: {
          fontWeight: 500,
          color: "#5d6672",
          fontSize: "12px",
        },
        td: { borderColor: "var(--mantine-color-default-border)" },
      },
    },
    Tabs: {
      defaultProps: { radius: 999 },
      styles: {
        list: { marginBottom: 4 },
        tab: { fontWeight: 500, borderRadius: 999 },
        panel: { paddingTop: 22 },
      },
    },
    Accordion: {
      styles: {
        item: {
          backgroundColor: "#ffffff",
          borderColor: "var(--mantine-color-default-border)",
          borderRadius: 16,
          overflow: "hidden",
        },
        control: { padding: "14px 16px" },
      },
    },
    Kbd: {
      styles: {
        root: {
          backgroundColor: "#ffffff",
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
  },
  light: {
    "--mantine-color-body": "#ffffff",
    "--mantine-color-text": theme.black,
    "--mantine-color-default-border": "#e2e6ed",
  },
  dark: {},
});
