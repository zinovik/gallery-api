export const performBatch = async <Arg, Res>(
    args: Arg[],
    perform: (arg: Arg) => Promise<Res>,
    batchSize: number,
    logName: string
) => {
    const results: Res[] = [];

    for (let i = 0; i < args.length; i += batchSize) {
        console.log(`- ${logName} batch starting from ${i}`);
        const promises = args
            .slice(i, i + batchSize)
            .map(async (arg) => await perform(arg));

        const resultsPart = await Promise.all(promises);

        results.push(...resultsPart);
    }
    console.log(`- ${logName} batch done`);

    return results;
};
