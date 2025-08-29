const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > visualizations > progress chart", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should render progress bar in query builder and dashboard (metabase#40658, metabase#41243)", () => {
    const QUESTION_NAME = "40658";
    const questionDetails = {
      name: QUESTION_NAME,
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
      display: "progress",
    };

    // check dashboard chart render
    H.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        // Make dashboard card really small (necessary for this repro as it doesn't show any labels)
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 5,
              size_y: 4,
              parameter_mappings: [],
            },
          ],
        });

        H.visitDashboard(dashboard_id);
      },
    );

    H.dashboardCards()
      .first()
      .within(() => {
        cy.findByText("18,760").should("be.visible");
        cy.findByText("Goal 0").should("be.visible");
        cy.findByText("Goal exceeded").should("be.visible");
      });

    // check query builder chart render
    H.dashboardCards().first().findByText(QUESTION_NAME).click();
    H.queryBuilderMain().within(() => {
      cy.findByText("18,760").should("be.visible");
      cy.findByText("Goal 0").should("be.visible");
      cy.findByText("Goal exceeded").should("be.visible");
    });
  });

  it("should allow value field selection with multiple numeric columns", () => {
    const questionDetails = {
      name: "Multi-column Progress Test",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"], ["sum", ["field", ORDERS.TOTAL, null]]],
      },
      display: "progress",
    };

    H.createQuestion(questionDetails, { visitQuestion: true });

    // Open visualization settings
    H.openVizSettingsSidebar();
    H.vizSettingsSidebar().within(() => {
      cy.findByText("Display").click();

      // Should show Value field selector since we have multiple numeric columns
      cy.findByText("Value").should("be.visible");

      // Default should be first column (Count)
      cy.findByDisplayValue("Count").should("exist");

      // Change to Sum of Total
      cy.findByDisplayValue("Count").click();
    });

    H.popover().within(() => {
      cy.findByText("Sum of Total").click();
    });

    // Verify the field changed
    H.vizSettingsSidebar().within(() => {
      cy.findByDisplayValue("Sum of Total").should("exist");
    });
  });

  it("should not show value field selector with single numeric column", () => {
    const questionDetails = {
      name: "Single Column Progress Test",
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
      display: "progress",
    };

    H.createQuestion(questionDetails, { visitQuestion: true });

    H.openVizSettingsSidebar();
    H.vizSettingsSidebar().within(() => {
      cy.findByText("Display").click();

      // Should NOT show Value field selector since we only have one numeric column
      cy.findByText("Value").should("not.exist");

      // Goal setting should still be visible
      cy.findByText("Goal").should("be.visible");
    });
  });

  it("should exclude value column from goal column options", () => {
    const questionDetails = {
      name: "Exclusion Test Progress",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          ["count"],
          ["sum", ["field", ORDERS.TOTAL, null]],
          ["avg", ["field", ORDERS.QUANTITY, null]],
        ],
      },
      display: "progress",
    };

    H.createQuestion(questionDetails, { visitQuestion: true });

    H.openVizSettingsSidebar();
    H.vizSettingsSidebar().within(() => {
      cy.findByText("Display").click();

      // Set value field to Sum of Total
      cy.findByDisplayValue("Count").click();
    });

    H.popover().within(() => {
      cy.findByText("Sum of Total").click();
    });

    // Switch goal to Column mode
    H.vizSettingsSidebar().within(() => {
      cy.findByText("Column").should("be.visible");
      cy.findByText("Column").click();

      // Open goal column dropdown
      cy.findByPlaceholderText("Select column").click();
    });

    // Should show Count and Average of Quantity, but NOT Sum of Total
    H.popover().within(() => {
      cy.findByText("Count").should("be.visible");
      cy.findByText("Average of Quantity").should("be.visible");
      cy.findByText("Sum of Total").should("not.exist");

      // Select Count
      cy.findByText("Count").click();
    });

    // Goal should show Count selected
    H.vizSettingsSidebar().within(() => {
      cy.findByDisplayValue("Count").should("exist");
    });
  });

  it("should be backwards compatibile", () => {
    // A question with numeric `progress.goal` and no `progress.value` should render a progress bar with the goal value
    const questionDetails = {
      name: "Backwards Compat Test",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
      display: "progress",
      visualization_settings: {
        "progress.goal": 1000,
      },
    };

    H.createQuestion(questionDetails, { visitQuestion: true });

    H.queryBuilderMain().within(() => {
      cy.findByText("18,760").should("be.visible");
      cy.contains("Goal 1,000").should("exist");
    });
  });
});
