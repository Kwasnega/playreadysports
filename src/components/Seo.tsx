import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SITE_URL = "https://joinplayready.com";
const DEFAULT_TITLE = "PLAYREADYSPORTS | Football Matches, Pitches & Tournaments in Ghana";
const DEFAULT_DESCRIPTION = "PlayReady Sports helps you find pickup football matches near you, join friendly games, book pitches, and discover tournaments across Ghana. Search Play Ready Sports, Play Ready, Play Ready Sports GH, and join play ready.";
const DEFAULT_KEYWORDS = "PlayReady Sports, Play Ready Sports, Play Ready, Play Ready GH, play ready sports gh, join play ready, join play, football matches Ghana, pickup football Accra, book football pitch Ghana, grassroots football Ghana";
const DEFAULT_IMAGE = `${SITE_URL}/prs.svg`;

type SeoProps = {
  title?: string;
  description?: string;
  keywords?: string;
  canonicalPath?: string;
  image?: string;
  type?: string;
};

const setMetaTag = (attribute: "name" | "property", value: string, content: string) => {
  let element = document.head.querySelector(`meta[${attribute}="${value}"]`) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, value);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
};

const setCanonicalLink = (href: string) => {
  let element = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", "canonical");
    document.head.appendChild(element);
  }
  element.setAttribute("href", href);
};

const getSeoData = (pathname: string) => {
  if (pathname === "/") {
    return {
      title: "Find Football Matches & Book Pitches in Ghana",
      description: "PLAYREADYSPORTS helps you join pickup football matches, book real pitches, and discover local football tournaments in Ghana.",
      keywords: "play ready sports gh, play ready, join play ready, football matches Ghana, football pickup Accra, football tournaments Ghana",
    };
  }

  if (pathname === "/join") {
    return {
      title: "Join Football Matches Near You",
      description: "Browse open football matches, join play ready sessions, and connect with players nearby through PLAYREADYSPORTS.",
      keywords: "join play ready, join play, football matches near me, pickup football Ghana, football game near me",
    };
  }

  if (pathname === "/create") {
    return {
      title: "Create a Football Match",
      description: "Create a football match, set your venue, and invite players in minutes with PLAYREADYSPORTS.",
      keywords: "create football match Ghana, organize football game, book football pitch, football tournament organizer",
    };
  }

  if (pathname === "/schedule") {
    return {
      title: "Football Schedule & Upcoming Games",
      description: "See upcoming football games, match schedules, and local fixtures with PLAYREADYSPORTS.",
      keywords: "football schedule Ghana, upcoming football matches, local football fixtures, play ready sports schedule",
    };
  }

  if (pathname === "/code") {
    return {
      title: "Enter Match Invite Code",
      description: "Use your invite code to join a PlayReady Sports match quickly and securely.",
      keywords: "join play ready code, match invite code, join football game",
    };
  }

  if (pathname.startsWith("/lobby/")) {
    return {
      title: "Match Lobby",
      description: "Join the live match lobby and get ready for kickoff with PLAYREADYSPORTS.",
      keywords: "football lobby, match lobby, join football lobby",
    };
  }

  if (pathname.startsWith("/player/")) {
    return {
      title: "Player Profile",
      description: "Discover football players, connect with teammates, and build your PlayReady Sports network.",
      keywords: "football player profile, join play ready players, football community Ghana",
    };
  }

  if (pathname === "/terms") {
    return {
      title: "Terms & Conditions",
      description: "Review the PLAYREADYSPORTS terms and conditions for booking matches and using the platform.",
      keywords: "play ready sports terms, football match platform terms",
    };
  }

  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    keywords: DEFAULT_KEYWORDS,
  };
};

export function Seo({
  title,
  description,
  keywords,
  canonicalPath,
  image = DEFAULT_IMAGE,
  type = "website",
}: SeoProps) {
  const location = useLocation();
  const routeMeta = getSeoData(location.pathname);
  const resolvedTitle = title ? `${title} | PLAYREADYSPORTS` : routeMeta.title.includes("PLAYREADYSPORTS") ? routeMeta.title : `${routeMeta.title} | PLAYREADYSPORTS`;
  const resolvedDescription = description ?? routeMeta.description;
  const resolvedKeywords = keywords ?? routeMeta.keywords;
  const resolvedCanonical = `${SITE_URL}${canonicalPath ?? location.pathname}`;

  useEffect(() => {
    document.title = resolvedTitle;
    setMetaTag("name", "description", resolvedDescription);
    setMetaTag("name", "keywords", resolvedKeywords);
    setMetaTag("name", "robots", "index, follow, max-image-preview:large");
    setMetaTag("name", "author", "PLAYREADYSPORTS");
    setMetaTag("name", "application-name", "PLAYREADYSPORTS");
    setMetaTag("name", "twitter:title", resolvedTitle);
    setMetaTag("name", "twitter:description", resolvedDescription);
    setMetaTag("name", "twitter:card", "summary_large_image");
    setMetaTag("name", "twitter:site", "@playreadysports");
    setMetaTag("property", "og:title", resolvedTitle);
    setMetaTag("property", "og:description", resolvedDescription);
    setMetaTag("property", "og:type", type);
    setMetaTag("property", "og:url", resolvedCanonical);
    setMetaTag("property", "og:site_name", "PLAYREADYSPORTS");
    setMetaTag("property", "og:image", image);
    setMetaTag("property", "og:image:alt", resolvedTitle);
    setCanonicalLink(resolvedCanonical);
  }, [location.pathname, resolvedCanonical, resolvedDescription, resolvedKeywords, resolvedTitle, image, type]);

  return null;
}
