import { refreshClubElo } from "../lib/data/clubEloStore";
refreshClubElo().then((result) => { console.log(JSON.stringify(result, null, 2)); }).catch((error) => { console.error(error); process.exitCode = 1; });
