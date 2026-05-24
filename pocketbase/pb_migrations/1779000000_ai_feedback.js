/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = new Collection({
    name: "ai_feedback",
    type: "base",
    schema: [
      {
        name: "ai_prediction",
        type: "json",
        required: false,
      },
      {
        name: "user_confidence",
        type: "number",
        required: false,
        options: { min: 1, max: 5 },
      },
      {
        name: "confidence_bucket",
        type: "select",
        required: false,
        options: {
          values: ["high", "medium-high", "medium", "low", "very-low"],
        },
      },
      {
        name: "ai_level",
        type: "select",
        required: false,
        options: {
          values: ["species", "genus", "family", "order", "class", "division", "kingdom"],
        },
      },
      {
        name: "ai_status",
        type: "select",
        required: false,
        options: {
          values: ["identified", "unknown", "unidentifiable"],
        },
      },
      {
        name: "sighting_id",
        type: "relation",
        required: false,
        options: {
          collectionId: "sightings",
          cascadeDelete: false,
        },
      },
      {
        name: "user_correction",
        type: "text",
        required: false,
      },
    ],
  });

  app.save(collection);

  // Allow any user to create feedback
  collection.createRule = "";
  app.save(collection);

  console.log("Created ai_feedback collection");
}, (app) => {
  const collection = app.findCollectionByNameOrId("ai_feedback");
  if (collection) {
    app.delete(collection);
  }
});
