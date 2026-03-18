export interface Scenario {
    id: string;
    durationMins: number;
    title: string;
    persona: {
        name: string;
        age: number;
        mood: string;
        context: string;
        scenarioDescription: string;
        implicitFacts: string[]; // these are things the user must unravel/discover by asking the agent the right questions
    };
}

export const scenarios: Scenario[] = [
    {
        id: "ps5-recommendations",
        durationMins: 1,
        title: "customer isn't sure what to buy",
        persona: {
            name: "John",
            age: 35,
            mood: "enquiring",
            scenarioDescription:
                "John has just arrived at the store and he's looking to buy a game for his brother",
            context:
                "your a customer who has just come in and has arrived at a video game store, your looking to buy a game for your brother... you want recommendations",
            implicitFacts: [
                "your little brother owns a ps5",
                "he is 12 years old",
                "he doesn't like shooting games",
            ],
        },
    },

    // your next scenario here...
];
