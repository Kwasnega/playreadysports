import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Seo } from "./Seo";

describe("Seo", () => {
  it("updates the document title and social metadata for the current route", () => {
    render(
      <MemoryRouter initialEntries={["/join"]}>
        <Seo />
      </MemoryRouter>
    );

    expect(document.title).toContain("PLAYREADYSPORTS");
    expect(document.title).toContain("Join Football Matches Near You");
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toContain("Browse open football matches");
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute("content")).toContain("PLAYREADYSPORTS");
  });
});
