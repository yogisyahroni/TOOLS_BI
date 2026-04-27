import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import App from "../App";
import { ThemeProvider } from "../components/ThemeProvider";

// Simple test to verify App renders without crashing
describe("App Integrity", () => {
  it("renders without crashing", () => {
    // We expect this to NOT throw "useTheme must be used within a ThemeProvider"
    const { container } = render(<App />);
    expect(container).toBeDefined();
  });
});

describe("ThemeProvider Isolation", () => {
  it("allows children to consume theme context", () => {
     // This verifies our fix: AppInitializer (child) can use useTheme
     // because it is rendered inside ThemeProvider in App.tsx
     const { container } = render(<App />);
     expect(container).toBeDefined();
  });
});
