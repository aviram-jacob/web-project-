document.addEventListener("DOMContentLoaded", function () {
  initializeSaveModal();

  if (!Array.isArray(window.tripPackages)) {
    showStartFromPreferencesState("Trip data is not available yet.");
    updateResultsMessage("Trip data is not available yet.");
    return;
  }

  applyStoredPreferences();
});

// Reads temporary trip preferences saved by the Preferences form.
// Expects sessionStorage to contain a tripPreferences JSON value, if available.
// Returns the parsed preferences object or null.
function getStoredPreferences() {
  const storedPreferences = sessionStorage.getItem("tripPreferences");

  if (!storedPreferences) {
    return null;
  }

  try {
    return JSON.parse(storedPreferences);
  } catch (error) {
    return null;
  }
}

// Converts saved preferences into the internal filters used for recommendations.
// Expects the object saved by validation.js under tripPreferences.
// Keeps all recommendation filtering frontend-only.
function buildFiltersFromPreferences(preferences) {
  return {
    tripType: preferences.tripType || "",
    maxBudget: Number(preferences.budget) || null,
    maxDuration: Number(preferences.durationDays) || null,
    travelers: Number(preferences.travelers) || null,
    kosherOnly: Boolean(preferences.kosherFriendly),
    interests: Array.isArray(preferences.interests) ? preferences.interests : []
  };
}

// Applies saved Plan a Trip preferences and renders matching packages.
// Expects window.tripPackages to be available.
// Shows an intro state when no preferences were submitted yet.
function applyStoredPreferences() {
  const storedPreferences = getStoredPreferences();

  if (!storedPreferences) {
    showStartFromPreferencesState("Start from Plan a Trip to get personalized recommendations.");
    updateResultsMessage("Choose your preferences first to see matched trip packages.");
    return;
  }

  const filters = buildFiltersFromPreferences(storedPreferences);
  const matchingTrips = getRankedRecommendations(filters);

  if (matchingTrips.length === 0) {
    showEmptyState("No trips match your current trip type, budget, and duration. Try increasing your budget or adjusting your duration.");
    updateResultsMessage("No trips match your current trip type, budget, and duration. Try increasing your budget or adjusting your duration.");
    return;
  }

  renderTripCards(matchingTrips);
  updateResultsMessage("Showing the top matching trips based on your preferences.");
}

// Formats visible trip prices in dollars.
// Expects a numeric price value.
// Returns a dollar-formatted string such as $1,500.
function formatPrice(price) {
  return "$" + price.toLocaleString();
}

// Filters and ranks trips from saved preferences.
// Expects filters built from sessionStorage preferences.
// Returns up to 10 trips ordered by customer rating plus interest matches.
function getRankedRecommendations(filters) {
  return window.tripPackages
    .map(function (trip) {
      return scoreTrip(trip, filters);
    })
    .filter(Boolean)
    .sort(sortScoredTrips)
    .slice(0, 10)
    .map(function (item) {
      return item.trip;
    });
}

// Scores one eligible trip with rating plus partial interest matches.
// Expects one trip object and saved-preference filters.
// Returns a scored item or null when trip type, budget, or duration do not fit.
function scoreTrip(trip, filters) {
  if (!isEligibleTrip(trip, filters)) {
    return null;
  }

  const interestMatches = countMatchingInterests(trip, filters.interests);
  const ratingSummary = getTripRatingSummary(trip);
  const averageCustomerRating = ratingSummary.average || 0;
  const durationDifference = getDurationDifference(trip, filters.maxDuration);
  const finalScore = averageCustomerRating + (interestMatches * 0.5);

  return {
    trip: trip,
    finalScore: finalScore,
    interestMatches: interestMatches,
    durationDifference: durationDifference
  };
}

// Applies mandatory trip type, budget, and duration rules.
// Expects one trip and filters built from the saved Plan a Trip form.
function isEligibleTrip(trip, filters) {
  if (!filters.tripType || normalizeValue(trip.tripType) !== normalizeValue(filters.tripType)) {
    return false;
  }

  const tripPrice = Number(trip.estimatedPrice);

  if (!filters.maxBudget || !Number.isFinite(tripPrice) || tripPrice > filters.maxBudget * 1.2) {
    return false;
  }

  if (!filters.maxDuration || getDurationDifference(trip, filters.maxDuration) > 3) {
    return false;
  }

  return true;
}

// Sorts by final score, then lower price, then duration closeness.
// Expects scored recommendation items.
function sortScoredTrips(first, second) {
  return second.finalScore - first.finalScore ||
    first.trip.estimatedPrice - second.trip.estimatedPrice ||
    first.durationDifference - second.durationDifference;
}

// Gets the real rating summary from static and localStorage reviews.
// Expects one trip object.
// Keeps recommendation ranking aligned with Trip Details.
function getTripRatingSummary(trip) {
  if (window.appStorage && window.appStorage.getTripRatingSummary) {
    return window.appStorage.getTripRatingSummary(trip);
  }

  return {
    average: null,
    count: 0
  };
}

// Formats a trip's real rating summary for recommendation cards.
// Expects one trip object.
function formatTripRatingSummary(trip) {
  const summary = getTripRatingSummary(trip);

  if (window.appStorage && window.appStorage.formatRatingSummary) {
    return window.appStorage.formatRatingSummary(summary);
  }

  return "Not rated yet";
}

// Counts selected interests that overlap with a trip's interest list.
// Partial matches improve ranking, but missing interests do not hide the trip.
function countMatchingInterests(trip, selectedInterests) {
  const tripInterests = Array.isArray(trip.interests) ? trip.interests.map(normalizeValue) : [];

  if (!Array.isArray(selectedInterests) || selectedInterests.length === 0) {
    return 0;
  }

  return selectedInterests.filter(function (interest) {
    return tripInterests.includes(normalizeValue(interest));
  }).length;
}

// Measures how close a trip duration is to the user's requested duration.
// Used for eligibility and as a final sorting tie-breaker.
function getDurationDifference(trip, requestedDuration) {
  return Math.abs((Number(trip.durationDays) || 0) - requestedDuration);
}

// Normalizes form and trip values before comparing them.
// Keeps matching stable even if capitalization changes in the data.
function normalizeValue(value) {
  return String(value || "").trim().toLowerCase();
}

// Renders trip cards into the recommendations grid.
// Expects an array of trip package objects.
// Clears the grid and appends one card for each trip.
function renderTripCards(trips) {
  const grid = document.getElementById("recommendations-grid");

  if (!grid) {
    return;
  }

  grid.innerHTML = "";

  trips.forEach(function (trip, index) {
    grid.appendChild(createTripCard(trip, index));
  });
}

// Creates one accessible recommendation card.
// Expects a trip package object and its position in the rendered list.
// Returns an article element ready to be inserted into the page.
function createTripCard(trip, index) {
  const card = document.createElement("article");
  card.className = "trip-card recommendation-card";
  card.style.animationDelay = Math.min(index * 0.035, 0.28) + "s";

  const detailsUrl = "trip-details.html?id=" + encodeURIComponent(trip.id);
  const ratingText = formatTripRatingSummary(trip);

  card.innerHTML =
    '<a class="trip-card-image-link" href="' + detailsUrl + '">' +
      '<img class="trip-card-image" src="' + trip.image + '" alt="' + trip.title + ' in ' + trip.city + ', ' + trip.country + '">' +
    '</a>' +
    '<div class="trip-card-body">' +
      '<div class="trip-card-heading">' +
        '<p class="placeholder-label">' + trip.tripType + '</p>' +
        '<h2>' + trip.title + '</h2>' +
        '<p class="trip-location">' + trip.city + ', ' + trip.country + '</p>' +
      '</div>' +
      '<p>' + trip.shortDescription + '</p>' +
      '<div class="tag-list">' + createTagsMarkup(trip) + '</div>' +
      '<dl class="trip-meta">' +
        '<div><dt>Price</dt><dd>' + formatPrice(trip.estimatedPrice) + '</dd></div>' +
        '<div><dt>Duration</dt><dd>' + trip.durationDays + ' days</dd></div>' +
        '<div><dt>Group</dt><dd>' + trip.recommendedGroupSize + '</dd></div>' +
        '<div><dt>Rating</dt><dd>' + ratingText + '</dd></div>' +
      '</dl>' +
      '<div class="trip-card-actions">' +
        '<a class="btn btn-primary" href="' + detailsUrl + '">View Details</a>' +
        '<button class="btn btn-secondary save-trip-button" type="button" data-trip-id="' + trip.id + '">&#9825; Save Trip</button>' +
      '</div>' +
    '</div>';

  const saveButton = card.querySelector(".save-trip-button");

  if (window.appStorage && window.appStorage.isTripSaved(trip.id)) {
    setSavedButtonState(saveButton, "\u2665 Saved");
  }

  saveButton.addEventListener("click", function () {
    handleSaveTrip(trip.id, saveButton);
  });

  return card;
}

// Updates the visible results status text.
// Expects a short status message string.
// Writes the message to the results status area.
function updateResultsMessage(message) {
  const status = document.getElementById("results-status");

  if (status) {
    status.textContent = message;
  }
}

// Shows a readable empty state in the recommendations grid.
// Expects the message to display to the user.
// Clears any previous cards before adding the empty state.
function showEmptyState(message) {
  const grid = document.getElementById("recommendations-grid");

  if (!grid) {
    return;
  }

  grid.innerHTML =
    '<div class="empty-state recommendations-empty-state">' +
      '<h2>No matching trips</h2>' +
      '<p>' + message + '</p>' +
      '<a class="btn btn-secondary" href="preferences.html">Update Preferences</a>' +
    '</div>';
}

// Shows the intro state when recommendations do not have saved preferences.
// Expects a short message to display in the recommendations grid.
// Guides users back to Plan a Trip instead of showing unfiltered packages.
function showStartFromPreferencesState(message) {
  const grid = document.getElementById("recommendations-grid");

  if (!grid) {
    return;
  }

  grid.innerHTML =
    '<div class="empty-state recommendations-empty-state large-empty-state">' +
      '<p class="section-label">Plan a Trip first</p>' +
      '<h2>Your personalized recommendations are waiting.</h2>' +
      '<p>' + message + '</p>' +
      '<a class="btn btn-primary" href="preferences.html">Update Preferences</a>' +
    '</div>';
}

// Opens the save modal for guests.
// Expects no input.
// Shows login and signup actions without saving data.
function openSaveModal() {
  const modal = document.getElementById("save-modal");

  if (modal) {
    modal.hidden = false;
  }
}

// Saves a trip for logged-in users or opens the guest modal.
// Expects a trip id and the clicked save button.
// Updates localStorage only when a user is logged in.
function handleSaveTrip(tripId, saveButton) {
  if (!window.appStorage || !window.appStorage.isUserLoggedIn()) {
    openSaveModal();
    return;
  }

  window.appStorage.saveTripById(tripId);
  setSavedButtonState(saveButton, "\u2665 Saved");
  updateResultsMessage("Trip saved to My Trips.");
}

// Updates a save button after a trip has been saved.
// Expects the button element and display text.
// Prevents duplicate save clicks for the same visible card.
function setSavedButtonState(button, text) {
  if (!button) {
    return;
  }

  button.textContent = text;
  button.classList.add("saved-button");
  button.disabled = true;
}

// Closes the save modal.
// Expects no input.
// Hides the modal without saving data.
function closeSaveModal() {
  const modal = document.getElementById("save-modal");

  if (modal) {
    modal.hidden = true;
  }
}

// Wires the close behavior for the save modal.
// Expects modal elements to exist on recommendations.html.
// Adds click listeners for the close button and backdrop.
function initializeSaveModal() {
  const modal = document.getElementById("save-modal");
  const closeButton = document.getElementById("close-save-modal");

  if (closeButton) {
    closeButton.addEventListener("click", closeSaveModal);
  }

  if (modal) {
    modal.addEventListener("click", function (event) {
      if (event.target === modal) {
        closeSaveModal();
      }
    });
  }
}

// Builds visible tag markup for a recommendation card.
// Expects a trip object.
// Returns HTML for tags, including Kosher-friendly when relevant.
function createTagsMarkup(trip) {
  const tags = trip.kosherFriendly ? trip.tags.concat("Kosher-friendly") : trip.tags;

  return tags.map(function (tag) {
    return '<span class="tag">' + tag + '</span>';
  }).join("");
}
