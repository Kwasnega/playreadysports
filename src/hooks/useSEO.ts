import { useEffect } from "react";

interface SEOProps {
  title: string;
  description: string;
  url?: string;
  image?: string;
  type?: "website" | "article" | "profile";
  structuredData?: Record<string, any>;
}

export function useSEO({
  title,
  description,
  url,
  image = "https://joinplayready.com/prs-og.png",
  type = "website",
  structuredData,
}: SEOProps) {
  useEffect(() => {
    // 1. Update Title
    document.title = title;
    
    // Helper to set or create meta tags
    const setMetaTag = (attrName: string, attrValue: string, content: string) => {
      let element = document.querySelector(`meta[${attrName}="${attrValue}"]`);
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attrName, attrValue);
        document.head.appendChild(element);
      }
      element.setAttribute("content", content);
    };

    // 2. Standard Meta Tags
    setMetaTag("name", "description", description);

    // 3. OpenGraph Tags
    setMetaTag("property", "og:title", title);
    setMetaTag("property", "og:description", description);
    setMetaTag("property", "og:type", type);
    setMetaTag("property", "og:image", image);
    
    const currentUrl = url || window.location.href;
    setMetaTag("property", "og:url", currentUrl);

    // 4. Twitter Card Tags
    setMetaTag("name", "twitter:title", title);
    setMetaTag("name", "twitter:description", description);
    setMetaTag("name", "twitter:image", image);

    // 5. Canonical URL
    let canonicalLink = document.querySelector(`link[rel="canonical"]`);
    if (!canonicalLink) {
      canonicalLink = document.createElement("link");
      canonicalLink.setAttribute("rel", "canonical");
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute("href", currentUrl);

    // 6. Structured Data (JSON-LD)
    let jsonLdScript = document.querySelector(`script[data-id="seo-structured-data"]`);
    if (structuredData) {
      if (!jsonLdScript) {
        jsonLdScript = document.createElement("script");
        jsonLdScript.setAttribute("type", "application/ld+json");
        jsonLdScript.setAttribute("data-id", "seo-structured-data");
        document.head.appendChild(jsonLdScript);
      }
      jsonLdScript.textContent = JSON.stringify({
        "@context": "https://schema.org",
        ...structuredData
      });
    } else if (jsonLdScript) {
      jsonLdScript.remove(); // Cleanup if the new page doesn't have structured data
    }

  }, [title, description, url, image, type, structuredData]);
}
