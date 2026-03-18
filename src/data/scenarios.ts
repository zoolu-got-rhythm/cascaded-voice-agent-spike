export interface Scenario {
    id: string;
    durationMins: number;
    title: string;
    score?: number;
    persona: {
        name: string;
        age: number;
        mood: string;
        context: string;
        implicitFacts: string[]
    };
}

export const scenarios: Scenario[] = [
    {
        id: "ps5-recommendations",
        durationMins: 1,
        title: "Customer Asks For PS5 Game Recommendations",
        score: 65,
        persona: {
            name: "John",
            age: 35,
            mood: "enquiring",
            context:
                "your a customer who has just come in and has arrived at a video game store, your looking to buy a game for your brother... you want recommendations",
            implicitFacts: [
              "your little brothers owns a ps5", "he is 12 years old", "he doesn't like shooting games"
            ]
        },
    },
    // {
    //     id: "faulty-game-trade-in",
    //     durationMins: 5,
    //     title: "Customer Wants To Trade In A Faulty Game",
    //     persona: {
    //         name: "Marcus",
    //         age: 32,
    //         mood: "frustrated",
    //         context:
    //             "Marcus wants to trade in a game that he says is faulty and is expecting a full refund or replacement.",
    //     },
    // },
    // {
    //     id: "new-hardware",
    //     durationMins: 10,
    //     title: "Customer Wants To Buy New Hardware",
    //     score: 40,
    //     persona: {
    //         name: "Sophie",
    //         age: 28,
    //         mood: "curious",
    //         context:
    //             "Sophie is looking to buy a new console but is unsure which one suits her budget and gaming preferences.",
    //     },
    // },
];
