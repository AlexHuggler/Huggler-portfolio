/**
 * Shiki theme that emits CSS variables instead of colors, so highlighted code
 * follows the site tokens (--shiki-* in global.css) and flips with the theme.
 * Shared by astro.config (MDX code fences) and <Code> components.
 */
import { createCssVariablesTheme } from "shiki/core";

export const cssVarsTheme = createCssVariablesTheme({
  name: "site-tokens",
  variablePrefix: "--shiki-",
  variableDefaults: {},
  fontStyle: true,
});
