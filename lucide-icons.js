/**
 * Lucide icons, vendored.
 *
 * Source:  https://github.com/lucide-icons/lucide
 * Version: 1.39.0 (released 2026-09-01)
 * Files:   icons/download.svg, icons/maximize.svg, icons/lightbulb.svg,
 *          icons/monitor.svg, icons/zap.svg, icons/wifi-off.svg,
 *          icons/smartphone.svg, icons/sparkles.svg
 * License: ISC, with MIT for the icons derived from Feather.
 *          Full texts in THIRD-PARTY-LICENSES.txt, which ships with the player.
 *
 * Vendored rather than pulled from a CDN because this template is offline-first:
 * the service worker precaches it and the install dialog advertises offline
 * play, so fetching icon markup over the network would fail in exactly the
 * situation the icons describe.
 *
 * Only the shape data below is upstream's, copied unchanged from the tag above.
 * Update by re-copying it from a newer tag and bumping the version in this
 * header, in THIRD-PARTY-LICENSES.txt, and in PWA-README.md.
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 */

(function () {
  "use strict";

  // Upstream ships each icon as a standalone <svg>. Only the inner shapes are
  // kept, because the wrapper attributes are identical across the set and are
  // applied once in svg() below.
  const SHAPES = {
    download:
      '<path d="M12 15V3"/>' +
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
      '<path d="m7 10 5 5 5-5"/>',
    maximize:
      '<path d="M8 3H5a2 2 0 0 0-2 2v3"/>' +
      '<path d="M21 8V5a2 2 0 0 0-2-2h-3"/>' +
      '<path d="M3 16v3a2 2 0 0 0 2 2h3"/>' +
      '<path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    lightbulb:
      '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>' +
      '<path d="M9 18h6"/>' +
      '<path d="M10 22h4"/>',
    monitor:
      '<rect width="20" height="14" x="2" y="3" rx="2"/>' +
      '<line x1="8" x2="16" y1="21" y2="21"/>' +
      '<line x1="12" x2="12" y1="17" y2="21"/>',
    zap: '<path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"/>',
    "wifi-off":
      '<path d="M12 20h.01"/>' +
      '<path d="M8.5 16.429a5 5 0 0 1 7 0"/>' +
      '<path d="M5 12.859a10 10 0 0 1 5.17-2.69"/>' +
      '<path d="M19 12.859a10 10 0 0 0-2.007-1.523"/>' +
      '<path d="M2 8.82a15 15 0 0 1 4.177-2.643"/>' +
      '<path d="M22 8.82a15 15 0 0 0-11.288-3.764"/>' +
      '<path d="m2 2 20 20"/>',
    smartphone:
      '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/>' +
      '<path d="M12 18h.01"/>',
    sparkles:
      '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>' +
      '<path d="M20 2v4"/>' +
      '<path d="M22 4h-4"/>' +
      '<circle cx="4" cy="20" r="2"/>',
  };

  // No width or height: pwa-install.css sizes these in em so each context's
  // font-size keeps controlling the icon, the way it did for the emoji these
  // replaced. Decorative throughout -- every icon sits beside its own label --
  // so they stay out of the accessibility tree.
  const ATTRIBUTES =
    'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true" focusable="false"';

  /**
   * Markup for one icon, or an empty string when the name is not vendored.
   *
   * @param {string} name Icon file name from the list in this file's header.
   * @param {string} [className] Extra classes for the <svg> element.
   * @returns {string} An <svg> element, ready to embed in a template string.
   */
  function svg(name, className) {
    const shapes = Object.prototype.hasOwnProperty.call(SHAPES, name)
      ? SHAPES[name]
      : null;
    if (!shapes) {
      console.warn(`[icons] no vendored icon named ${name}`);
      return "";
    }

    const classes = className ? `pwa-svg-icon ${className}` : "pwa-svg-icon";
    return `<svg class="${classes}" ${ATTRIBUTES}>${shapes}</svg>`;
  }

  window.LucideIcons = { svg };
})();
