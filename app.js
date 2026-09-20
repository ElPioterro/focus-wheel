/* Focus Wheel — interactivity
 * State, click-to-edit modal, SVG text rendering, and clear. */

(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var POSITION_COUNT = 12;

  // Geometry (matches viewBox="0 0 600 600")
  var CX = 300;
  var CY = 300;
  var OUTER_RADIUS = 270; // the main wheel edge
  var INNER_RADIUS = 95; // the core-desire circle
  var TEXT_RADIUS = 190; // where the 12 outer labels sit
  var HIT_RADIUS = 46; // invisible clickable area per position

  // Decoration geometry
  var SPOKE_INNER = 100; // spoke starts just outside the inner circle
  var SPOKE_OUTER = 262; // spoke ends just inside the outer circle
  var GUIDE_RADIUS = 245; // dashed guide ring between text and outer edge
  var ANCHOR_DOT_R = 3.5; // little anchor dots on the outer ring

  // Color progression for filled thoughts: light/muted at the first
  // position, gradually warmer and deeper toward the last, giving a
  // gentle sense of building momentum. [r, g, b].
  var PROGRESS_LIGHT = [170, 160, 148];
  var PROGRESS_DEEP = [150, 110, 80];

  // Wrapping + typography
  var OUTER_MAX_CHARS = 25;
  var CENTER_MAX_CHARS = 20;
  var OUTER_LINE_HEIGHT = 16; // px
  var CENTER_LINE_HEIGHT = 15; // px

  var CENTER_PLACEHOLDER = "What do I want to feel?";
  var OUTER_PLACEHOLDER = "Write a thought that feels good...";

  // Export
  var EXPORT_SCALE = 2; // high-resolution capture
  var PAGE_BG = "#f9f7f4"; // matches the page background
  var SVG_SIZE = 600; // matches the viewBox

  // ---- State ----
  var wheelData = {
    center: "",
    positions: new Array(POSITION_COUNT).fill(""),
  };

  // ---- Element references ----
  var svg = document.querySelector(".wheel");
  var slotsGroup = document.getElementById("slots");
  var centerText = document.getElementById("center-text");

  // Modal state
  var modal = {};
  var currentTarget = null; // { type: "center" } or { type: "position", index: n }

  // ---------------------------------------------------------------------------
  // Text wrapping
  // ---------------------------------------------------------------------------
  function wrapText(text, maxChars) {
    var words = text.trim().split(/\s+/);
    var lines = [];
    var current = "";

    words.forEach(function (word) {
      if (!current) {
        current = word;
      } else if ((current + " " + word).length <= maxChars) {
        current += " " + word;
      } else {
        lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
    return lines;
  }

  // Render an array of lines into an SVG <text> element, vertically centered
  // around (x, y) using <tspan> elements.
  function renderLines(textEl, lines, x, y, lineHeight) {
    // Clear existing tspans
    while (textEl.firstChild) textEl.removeChild(textEl.firstChild);

    var total = lines.length;
    var startY = y - ((total - 1) * lineHeight) / 2;

    lines.forEach(function (line, i) {
      var tspan = document.createElementNS(SVG_NS, "tspan");
      tspan.setAttribute("x", x);
      tspan.setAttribute("y", startY + i * lineHeight);
      tspan.textContent = line;
      textEl.appendChild(tspan);
    });
  }

  // ---------------------------------------------------------------------------
  // Rendering the wheel
  // ---------------------------------------------------------------------------
  // Point on a circle for a given position index.
  // Index 0 = 12 o'clock (top); clockwise every 30 degrees.
  function pointOnCircle(index, radius) {
    var angle = (-90 + index * 30) * (Math.PI / 180);
    return {
      x: CX + radius * Math.cos(angle),
      y: CY + radius * Math.sin(angle),
    };
  }

  function positionCoords(index) {
    return pointOnCircle(index, TEXT_RADIUS);
  }

  // Interpolated fill color for a filled position (light -> deep).
  function colorForIndex(index) {
    var t = POSITION_COUNT > 1 ? index / (POSITION_COUNT - 1) : 0;
    var mix = function (a, b) {
      return Math.round(a + (b - a) * t);
    };
    return (
      "rgb(" +
      mix(PROGRESS_LIGHT[0], PROGRESS_DEEP[0]) +
      ", " +
      mix(PROGRESS_LIGHT[1], PROGRESS_DEEP[1]) +
      ", " +
      mix(PROGRESS_LIGHT[2], PROGRESS_DEEP[2]) +
      ")"
    );
  }

  // Build the faint decorative layer once: 12 spokes, a dashed guide ring,
  // and small anchor dots on the outer ring.
  function buildDecorations() {
    var decor = document.getElementById("decor");
    if (!decor) return;
    while (decor.firstChild) decor.removeChild(decor.firstChild);

    // Dashed guide ring
    var guide = document.createElementNS(SVG_NS, "circle");
    guide.setAttribute("class", "guide-ring");
    guide.setAttribute("cx", CX);
    guide.setAttribute("cy", CY);
    guide.setAttribute("r", GUIDE_RADIUS);
    guide.setAttribute("stroke-dasharray", "2 8");
    guide.setAttribute("stroke-linecap", "round");
    decor.appendChild(guide);

    for (var i = 0; i < POSITION_COUNT; i++) {
      var inner = pointOnCircle(i, SPOKE_INNER);
      var outer = pointOnCircle(i, SPOKE_OUTER);

      var spoke = document.createElementNS(SVG_NS, "line");
      spoke.setAttribute("class", "spoke");
      spoke.setAttribute("x1", inner.x);
      spoke.setAttribute("y1", inner.y);
      spoke.setAttribute("x2", outer.x);
      spoke.setAttribute("y2", outer.y);
      decor.appendChild(spoke);

      var dotPos = pointOnCircle(i, OUTER_RADIUS);
      var dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("class", "anchor-dot");
      dot.setAttribute("cx", dotPos.x);
      dot.setAttribute("cy", dotPos.y);
      dot.setAttribute("r", ANCHOR_DOT_R);
      decor.appendChild(dot);
    }
  }

  // Build the 12 outer position groups once.
  function buildPositions() {
    while (slotsGroup.firstChild) slotsGroup.removeChild(slotsGroup.firstChild);

    for (var i = 0; i < POSITION_COUNT; i++) {
      var coords = positionCoords(i);

      var group = document.createElementNS(SVG_NS, "g");
      group.setAttribute("class", "position");
      group.setAttribute("data-slot", String(i));

      // Invisible hit area so empty positions are clickable.
      var hit = document.createElementNS(SVG_NS, "circle");
      hit.setAttribute("class", "hit-area");
      hit.setAttribute("cx", coords.x);
      hit.setAttribute("cy", coords.y);
      hit.setAttribute("r", HIT_RADIUS);

      var text = document.createElementNS(SVG_NS, "text");
      text.setAttribute("class", "wheel-text");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("x", coords.x);
      text.setAttribute("y", coords.y);

      group.appendChild(hit);
      group.appendChild(text);
      slotsGroup.appendChild(group);
    }
  }

  function renderPosition(index) {
    var group = slotsGroup.querySelector('[data-slot="' + index + '"]');
    if (!group) return;

    var textEl = group.querySelector("text");
    var coords = positionCoords(index);
    var value = wheelData.positions[index];

    if (value) {
      group.classList.add("filled");
      textEl.classList.remove("placeholder");
      // Progression color: lighter at the first thought, deeper at the last.
      textEl.style.fill = colorForIndex(index);
      renderLines(
        textEl,
        wrapText(value, OUTER_MAX_CHARS),
        coords.x,
        coords.y,
        OUTER_LINE_HEIGHT
      );
    } else {
      group.classList.remove("filled");
      textEl.classList.add("placeholder");
      textEl.style.fill = "";
      // Subtle clock-number hint when empty.
      renderLines(
        textEl,
        [String(index === 0 ? 12 : index)],
        coords.x,
        coords.y,
        OUTER_LINE_HEIGHT
      );
    }
  }

  function renderCenter() {
    var value = wheelData.center;
    if (value) {
      centerText.classList.add("filled");
      centerText.classList.remove("placeholder");
      renderLines(
        centerText,
        wrapText(value, CENTER_MAX_CHARS),
        CX,
        CY,
        CENTER_LINE_HEIGHT
      );
    } else {
      centerText.classList.remove("filled");
      centerText.classList.add("placeholder");
      renderLines(
        centerText,
        wrapText(CENTER_PLACEHOLDER, CENTER_MAX_CHARS),
        CX,
        CY,
        CENTER_LINE_HEIGHT
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Completion state
  // ---------------------------------------------------------------------------
  var wasComplete = false;

  function isComplete() {
    if (!wheelData.center) return false;
    return wheelData.positions.every(function (p) {
      return !!p;
    });
  }

  function updateCompletion() {
    var complete = isComplete();
    var app = document.querySelector(".app");

    if (complete) {
      svg.classList.add("complete");
      if (app) app.classList.add("is-complete");
      if (!wasComplete) {
        // Trigger a single gentle pulse (restart the animation).
        svg.classList.remove("celebrate");
        void svg.getBoundingClientRect(); // force reflow
        svg.classList.add("celebrate");
      }
    } else {
      svg.classList.remove("complete", "celebrate");
      if (app) app.classList.remove("is-complete");
    }

    wasComplete = complete;
  }

  function renderAll() {
    renderCenter();
    for (var i = 0; i < POSITION_COUNT; i++) renderPosition(i);
    updateCompletion();
  }

  // ---------------------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------------------
  function buildModal() {
    var backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";

    var box = document.createElement("div");
    box.className = "modal";

    var label = document.createElement("label");
    label.setAttribute("for", "modal-input");
    label.textContent = "Focus Wheel";

    var input = document.createElement("textarea");
    input.id = "modal-input";

    var actions = document.createElement("div");
    actions.className = "modal-actions";

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "cancel-btn";
    cancelBtn.textContent = "Cancel";

    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "save-btn";
    saveBtn.textContent = "Save";

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    box.appendChild(label);
    box.appendChild(input);
    box.appendChild(actions);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    modal = {
      backdrop: backdrop,
      box: box,
      label: label,
      input: input,
      saveBtn: saveBtn,
      cancelBtn: cancelBtn,
    };

    // Backdrop click closes (but not clicks inside the box).
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) closeModal();
    });
    cancelBtn.addEventListener("click", closeModal);
    saveBtn.addEventListener("click", saveModal);

    // Enter saves; Shift+Enter inserts a line break.
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        saveModal();
      }
    });
  }

  function openModal(target) {
    currentTarget = target;

    if (target.type === "center") {
      modal.label.textContent = "Core desire";
      modal.input.placeholder = CENTER_PLACEHOLDER;
      modal.input.value = wheelData.center;
    } else {
      modal.label.textContent =
        "Position " + (target.index === 0 ? 12 : target.index);
      modal.input.placeholder = OUTER_PLACEHOLDER;
      modal.input.value = wheelData.positions[target.index];
    }

    modal.backdrop.classList.add("open");
    // Focus after the transition kicks in.
    window.setTimeout(function () {
      modal.input.focus();
    }, 50);
  }

  function closeModal() {
    modal.backdrop.classList.remove("open");
    currentTarget = null;
  }

  function saveModal() {
    if (!currentTarget) return;
    var value = modal.input.value.trim();

    if (currentTarget.type === "center") {
      wheelData.center = value;
      renderCenter();
    } else {
      wheelData.positions[currentTarget.index] = value;
      renderPosition(currentTarget.index);
    }
    updateCompletion();
    closeModal();
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------
  function handleSvgClick(e) {
    var el = e.target.closest("[data-slot]");
    if (!el) return;

    var slot = el.getAttribute("data-slot");
    if (slot === "center") {
      openModal({ type: "center" });
    } else {
      openModal({ type: "position", index: parseInt(slot, 10) });
    }
  }

  function handleKeydown(e) {
    if (e.key === "Escape" && modal.backdrop.classList.contains("open")) {
      closeModal();
    }
  }

  function clearWheel() {
    var ok = window.confirm(
      "Clear the entire wheel? This will erase your center desire and all 12 thoughts."
    );
    if (!ok) return;

    wheelData.center = "";
    wheelData.positions = new Array(POSITION_COUNT).fill("");
    renderAll();
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------
  // Properties copied from the live stylesheet onto the clone, since a
  // serialized SVG loaded as an <img> has no access to the page's CSS.
  var STYLE_PROPS = [
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-width",
    "stroke-opacity",
    "font-family",
    "font-size",
    "font-style",
    "font-weight",
    "letter-spacing",
    "text-anchor",
    "opacity",
    "display",
    "visibility",
  ];

  function inlineComputedStyles(srcEl, cloneEl) {
    var cs = window.getComputedStyle(srcEl);
    STYLE_PROPS.forEach(function (prop) {
      var value = cs.getPropertyValue(prop);
      if (value) cloneEl.style.setProperty(prop, value);
    });

    var srcChildren = srcEl.children;
    var cloneChildren = cloneEl.children;
    for (var i = 0; i < srcChildren.length; i++) {
      inlineComputedStyles(srcChildren[i], cloneChildren[i]);
    }
  }

  // Rasterize the wheel SVG onto a canvas at EXPORT_SCALE, on a solid
  // page-colored background. Captures the current visual state (all text).
  function captureCanvas() {
    return new Promise(function (resolve, reject) {
      try {
        var clone = svg.cloneNode(true);
        inlineComputedStyles(svg, clone);
        clone.setAttribute("xmlns", SVG_NS);
        clone.setAttribute("width", SVG_SIZE);
        clone.setAttribute("height", SVG_SIZE);
        clone.setAttribute("viewBox", "0 0 " + SVG_SIZE + " " + SVG_SIZE);

        var xml = new XMLSerializer().serializeToString(clone);
        var src =
          "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);

        var img = new Image();
        img.onload = function () {
          try {
            var canvas = document.createElement("canvas");
            canvas.width = SVG_SIZE * EXPORT_SCALE;
            canvas.height = SVG_SIZE * EXPORT_SCALE;

            var ctx = canvas.getContext("2d");
            ctx.fillStyle = PAGE_BG;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas);
          } catch (drawErr) {
            reject(drawErr);
          }
        };
        img.onerror = function () {
          reject(new Error("Could not rasterize the wheel."));
        };
        img.src = src;
      } catch (err) {
        reject(err);
      }
    });
  }

  // Builds a filename like "focus-wheel-2026-09-20_14-32-05.png" using the
  // current local date and time at the moment of export.
  function timestampedName(prefix, ext) {
    var d = new Date();
    var pad = function (n) {
      return String(n).padStart(2, "0");
    };
    var stamp =
      d.getFullYear() +
      "-" +
      pad(d.getMonth() + 1) +
      "-" +
      pad(d.getDate()) +
      "_" +
      pad(d.getHours()) +
      "-" +
      pad(d.getMinutes()) +
      "-" +
      pad(d.getSeconds());
    return prefix + "-" + stamp + "." + ext;
  }

  function triggerDownload(href, filename) {
    var a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Wraps a task with "Exporting..." button state + error handling.
  function runExport(btn, task) {
    var original = btn.textContent;
    btn.textContent = "Exporting...";
    btn.disabled = true;

    Promise.resolve()
      .then(task)
      .catch(function (err) {
        console.error("Export failed:", err);
        window.alert("Sorry, the export failed. Please try again.");
      })
      .then(function () {
        btn.textContent = original;
        btn.disabled = false;
      });
  }

  function exportPngTask() {
    return captureCanvas().then(function (canvas) {
      triggerDownload(
        canvas.toDataURL("image/png"),
        timestampedName("focus-wheel", "png")
      );
    });
  }

  function exportPdfTask() {
    return captureCanvas().then(function (canvas) {
      var jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
      if (!jsPDFCtor) throw new Error("jsPDF library is not available.");

      var imgData = canvas.toDataURL("image/png");
      var pdf = new jsPDFCtor({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      // A4 is 210 x 297mm. Center the square image with padding.
      var pageW = 210;
      var pageH = 297;
      var padding = 15;
      var size = Math.min(pageW - padding * 2, pageH - padding * 2);
      var x = (pageW - size) / 2;
      var y = (pageH - size) / 2;

      pdf.addImage(imgData, "PNG", x, y, size, size);
      pdf.save(timestampedName("focus-wheel", "pdf"));
    });
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  function init() {
    buildModal();
    buildDecorations();
    buildPositions();
    renderAll();

    // Event delegation for all wheel clicks (shapes + text).
    svg.addEventListener("click", handleSvgClick);
    document.addEventListener("keydown", handleKeydown);

    // Remove the one-shot pulse class once it finishes, so it can replay.
    svg.addEventListener("animationend", function () {
      svg.classList.remove("celebrate");
    });

    // Collapsible instruction panel.
    var toggle = document.querySelector(".instructions-toggle");
    var body = document.getElementById("instructions-body");
    if (toggle && body) {
      toggle.addEventListener("click", function () {
        var expanded = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!expanded));
        body.hidden = expanded;
      });
    }

    var clearBtn = document.getElementById("clear");
    if (clearBtn) clearBtn.addEventListener("click", clearWheel);

    var pngBtn = document.getElementById("export-png");
    if (pngBtn) {
      pngBtn.addEventListener("click", function () {
        runExport(pngBtn, exportPngTask);
      });
    }

    var pdfBtn = document.getElementById("export-pdf");
    if (pdfBtn) {
      pdfBtn.addEventListener("click", function () {
        runExport(pdfBtn, exportPdfTask);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expose for the export step / debugging.
  window.FocusWheel = {
    getData: function () {
      return wheelData;
    },
    render: renderAll,
  };
})();
